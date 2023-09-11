const { program } = require('commander');
const QRCode = require('qrcode');
const csvWriter = require('csv-writer');
const fs = require('fs');
const path = require('path');

// Define a template for vCard data as a string
const vCardDataTemplate = `
BEGIN:VCARD
VERSION:3.0
FN:John Doe
TEL:123456789
EMAIL:john.doe@example.com
PHOTO;MEDIATYPE=image/jpeg:https://example.com/path/to/photo.jpg
END:VCARD
`;

// Function to create a downloadable vCard file from a vCard data string
function outputVCardData(vCardData, outputFilePath) {
    fs.writeFileSync(outputFilePath, vCardData);
}

// Function to validate if a string is a properly formatted CSV
function isValidCSV(csvInput) {
    return typeof csvInput === 'string' && csvInput.includes(',');
}

// Function to validate email format
function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

// Function to validate phone number format
function validatePhone(phone) {
    const regex = /^\+?[1-9]\d{1,14}$/;
    return regex.test(phone);
}

// Function to validate URL format
function validateURL(url) {
    try {
        new URL(url);
        return true;
    } catch (_) {
        return false;
    }
}

// Function to extract data from CSV and create a vCard string
function extractDataAndCreateVCard(csvInput) {
    const lines = csvInput.split('\n');
    const headers = lines[0].split(',');
    const fullNameIndex = headers.indexOf('Full Name');
    const phoneIndex = headers.indexOf('Phone');
    const emailIndex = headers.indexOf('Email');
    const photoUrlIndex = headers.indexOf('Photo URL');

    const vCards = [];
  

    for (let i = 1; i < lines.length; i++) {
        const data = lines[i].split(',');

        if (data[0] === '') break;

        if (!data[fullNameIndex]) {
            throw new Error('Full Name cannot be empty');
        }

        if (!validatePhone(data[phoneIndex])) {
            throw new Error('Invalid phone number format');
        }

        if (!validateEmail(data[emailIndex])) {
            throw new Error('Invalid email format');
        }

        if (data[photoUrlIndex] && !validateURL(data[photoUrlIndex])) {
            throw new Error('Invalid photo URL format');
        }

        const vCardData = vCardDataTemplate
            .replace('John Doe', data[fullNameIndex])
            .replace('123456789', data[phoneIndex])
            .replace('john.doe@example.com', data[emailIndex])
            .replace('https://example.com/path/to/photo.jpg', data[photoUrlIndex] || '');

        vCards.push(vCardData);
    }

    return vCards;
}

// Function to generate a dynamic link from a CSV input
async function generateDynamicLink(csvInput, outputFilePath, baseUrl) {
    if (isValidCSV(csvInput)) {
        const vCardData = extractDataAndCreateVCard(csvInput);
        outputVCardData(vCardData, outputFilePath);

        const url = `${baseUrl}/download/${path.basename(outputFilePath)}`;
        const qrCode = await QRCode.toDataURL(url);

        return { url, qrCode };
    } else {
        throw new Error("Only a legitimate CSV string can be passed to this function. Here are some examples: ...");
    }
}

program
  .option('-i, --input <path>', 'input CSV file')
  .option('-s, --string <value>', 'input CSV string')
  .option('-o, --output <path>', 'output vCard file path', 'contact.vcf')
  .option('-b, --base-url <url>', 'base URL for the web server hosting the vCards');

program.parse(process.argv);

const options = program.opts();

(async () => {
    if (options.input && options.baseUrl) {
        const csvInput = fs.readFileSync(options.input, 'utf-8');
        const vCardDatas = extractDataAndCreateVCard(csvInput);

        const records = [];
        for (let i = 0; i < vCardDatas.length; i++) {
            const outputFilePath = options.output.replace('.vcf', `_${i}.vcf`);
            outputVCardData(vCardDatas[i], outputFilePath);

            const url = `${options.baseUrl}/download/${path.basename(outputFilePath)}`;
            const qrCode = await QRCode.toDataURL(url);

            const qrCodeImg = `<img src="${qrCode}" alt="QR Code">`;

            // Define a path to save the QR code as a PNG file
            const qrCodeFilePath = `qr_code_${i}.png`;
            // Save the QR code as a PNG file
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
        console.error('Both --input and --base-url options are required');
        process.exit(1);
    }
})();

