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
END:VCARD
`;

async function getBase64FromFile(filePath) {
    try {
        const data = fs.readFileSync(filePath);
        return data.toString('base64');
    } catch (e) {
        console.error('Failed to read or convert image to base64:', e);
        throw e;
    }
}

function outputVCardData(vCardData, outputFilePath) {
    const outputDir = path.dirname(outputFilePath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputFilePath, vCardData);
}

function isValidCSV(csvInput) {
    return typeof csvInput === 'string' && csvInput.includes(',');
}

function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

function validatePhone(phone) {
    const regex = /^\+?[1-9]\d{1,14}$/;
    return regex.test(phone);
}

function validateURL(url) {
    try {
        new URL(url);
        return true;
    } catch (_) {
        return false;
    }
}

async function extractDataAndCreateVCard(csvInput, imageSourceDir) {
    const lines = csvInput.split('\n');
    const headers = lines[0].split(',');
    const fullNameIndex = headers.indexOf('Full Name');
    const phoneIndex = headers.indexOf('Phone');
    const emailIndex = headers.indexOf('Email');
    const imageIndex = headers.indexOf('Image');
    const urlIndex = headers.indexOf('URL');

    const vCards = [];

    for (let i = 1; i < lines.length; i++) {
        const data = lines[i].split(',');

        if (data[0] === '') break;

        const name = data[fullNameIndex].replace(/ /g, '_');
        const outputFilePath = `./output/${name}.vcf`;

        if (!data[fullNameIndex]) {
            throw new Error('Full Name cannot be empty');
        }

        if (!validatePhone(data[phoneIndex])) {
            throw new Error('Invalid phone number format');
        }

        if (!validateEmail(data[emailIndex])) {
            throw new Error('Invalid email format');
        }

        if (data[urlIndex] && !validateURL(data[urlIndex])) {
            throw new Error('Invalid URL format');
        }

        let photoData = '';
        if (data[imageIndex]) {
            try {
                const filePath = path.join(imageSourceDir, data[imageIndex]);
                photoData = await getBase64FromFile(filePath);
                photoData = `PHOTO;ENCODING=b;TYPE=JPEG:${photoData}`;
            } catch (error) {
                throw new Error('Failed to read or encode the local image file');
            }
        }

        const vCardData = vCardDataTemplate
            .replace('John Doe', data[fullNameIndex])
            .replace('123456789', data[phoneIndex])
            .replace('john.doe@example.com', data[emailIndex])
            .replace('PHOTO_PLACEHOLDER', photoData ? `\n${photoData}` : '')
            .replace('URL_PLACEHOLDER', data[urlIndex] ? data[urlIndex] : '');

        vCards.push({ vCardData, outputFilePath });
    }

    return vCards;
}

async function generateDynamicLink(csvInput, outputFilePath, baseUrl, imageSourceDir) {
    if (isValidCSV(csvInput)) {
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
    } else {
        throw new Error("Only a legitimate CSV string can be passed to this function.");
    }
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
