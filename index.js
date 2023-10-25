const { program } = require('commander');
const QRCode = require('qrcode');
const csvWriter = require('csv-writer');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const vCardDataTemplate = `
BEGIN:VCARD
VERSION:3.0
FN:John Doe
TEL:123456789
EMAIL:john.doe@example.com
PHOTO_PLACEHOLDER
URL:URL_PLACEHOLDER
URL:LINKEDIN_URL_PLACEHOLDER
END:VCARD
`;

function formatPhoneNumber(phoneNumber) {
    // Remove any existing periods from the phone number
    const cleanedNumber = phoneNumber.replace(/\./g, '');

    // Match 11-digit and 10-digit numbers
    const match11Chars = cleanedNumber.match(/^(\d{1})(\d{3})(\d{3})(\d{4})$/);
    const match10Chars = cleanedNumber.match(/^(\d{3})(\d{3})(\d{4})$/);

    // Format 11-digit numbers
    if (match11Chars) {
        return `${match11Chars[1]}.${match11Chars[2]}.${match11Chars[3]}.${match11Chars[4]}`;
    }

    // Format 10-digit numbers
    if (match10Chars) {
        return `${match10Chars[1]}.${match10Chars[2]}.${match10Chars[3]}`;
    }

    return null;
}


async function getBase64FromFile(filePath) {
    const data = fs.readFileSync(filePath);
    return data.toString('base64');
}

function outputVCardData(vCardData, outputFilePath) {
    const outputDir = path.dirname(outputFilePath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputFilePath, vCardData);
}

async function extractDataAndCreateVCard(csvInput, imageSourceDir) {
    const lines = csvInput.split('\n');
    const headers = lines[0].split(',');
    const fullNameIndex = headers.indexOf('Full Name');
    const phoneIndex = headers.indexOf('Phone');
    const emailIndex = headers.indexOf('Email');
    const imageIndex = headers.indexOf('Image');
    const urlIndex = headers.indexOf('URL');
    const linkedinUrlIndex = headers.indexOf('LinkedIn URL');
    
    const vCards = [];

    for (let i = 1; i < lines.length; i++) {
        try {
        const data = lines[i].split(',');

        if (data[0] === '') break;

        const name = data[fullNameIndex].replace(/ /g, '_');
        const outputFilePath = `./output/${name}.vcf`;

        if (!data[fullNameIndex]) {
            throw new Error('Full Name cannot be empty');
        }


        console.log({dataPhoneIndex: data[phoneIndex]});

        const formattedPhone = formatPhoneNumber(data[phoneIndex]);

        console.log({ formattedPhone });

        if (!formattedPhone) {
            throw new Error('Invalid phone number format');
        }

        let photoData = '';

        if (data[imageIndex]) {
            const filePath = path.join(imageSourceDir, data[imageIndex]);
            photoData = await getBase64FromFile(filePath);
            photoData = `PHOTO;ENCODING=b;TYPE=JPEG:${photoData}`;
        }

        const vCardData = vCardDataTemplate
            .replace('John Doe', data[fullNameIndex])
            .replace('123456789', formattedPhone)
            .replace('john.doe@example.com', data[emailIndex])
            .replace('PHOTO_PLACEHOLDER', photoData ? `\n${photoData}` : '')
            .replace('URL_PLACEHOLDER', data[urlIndex] ? data[urlIndex] : '')
            .replace('LINKEDIN_URL_PLACEHOLDER', data[linkedinUrlIndex] ? data[linkedinUrlIndex] : '');

        vCards.push({ vCardData, outputFilePath });

        } catch (error) {
          console.error(`Error processing line ${i + 1}: ${error.message}`);
          continue;
        }
    }

    return vCards;
}

async function generateDynamicLink(csvInput, outputFilePath, baseUrl, imageSourceDir) {
    const vCards = await extractDataAndCreateVCard(csvInput, imageSourceDir);

    const records = [];
    for (let i = 0; i < vCards.length; i++) {
        outputVCardData(vCards[i].vCardData, vCards[i].outputFilePath);

        const url = `${baseUrl}/${path.basename(vCards[i].outputFilePath)}`;
        const qrCode = await QRCode.toDataURL(url);

        const qrCodeImg = `<img src="${qrCode}" alt="QR Code">`;

        const qrCodeFilePath = `${vCards[i].outputFilePath}.png`;
        await QRCode.toFile(qrCodeFilePath, url);

        records.push({ url, qrCode, qrCodeImg });
    }

    const csvWriterInstance = csvWriter.createObjectCsvWriter({
        path: 'output.csv',
        header: [
            { id: 'url', title: 'URL' },
            { id: 'qrCode', title: 'QR_CODE' },
            { id: 'qrCodeImg', title: 'QR_CODE_IMG' },
        ],
    });

    await csvWriterInstance.writeRecords(records);
    console.log('Output CSV has been saved with URL and QR code data');
}

program
  .option('-c, --config <path>', 'Configuration file path (JSON or YAML)')
  .option('-i, --input <path>', 'Input CSV file')
  .option('-b, --base-url <url>', 'Base URL for the web server hosting the vCards')
  .option('--image-source-dir <dir>', 'Directory where image files are stored');

program.parse(process.argv);

const options = program.opts();

(async () => {
    let config = {};
    if (options.config) {
        const configFilePath = options.config;
        const configFileExtension = path.extname(configFilePath).toLowerCase();
        const configFileData = fs.readFileSync(configFilePath, 'utf-8');

        if (configFileExtension === '.json') {
            config = JSON.parse(configFileData);
        } else if (configFileExtension === '.yaml' || configFileExtension === '.yml') {
            config = yaml.load(configFileData);
        } else {
            console.error('Invalid configuration file format. Only JSON and YAML are supported.');
            process.exit(1);
        }
    }

    const csvInputPath = options.input || config.input;
    const baseUrl = options.baseUrl || config.baseUrl;
    const imageSourceDir = options.imageSourceDir || config.imageSourceDir || '.';

    if (csvInputPath && baseUrl) {
        const csvInput = fs.readFileSync(csvInputPath, 'utf-8');
        await generateDynamicLink(csvInput, undefined, baseUrl, imageSourceDir);
    } else {
        console.error('Both --input and --base-url options are required, either through CLI options or configuration file');
        process.exit(1);
    }
})();

