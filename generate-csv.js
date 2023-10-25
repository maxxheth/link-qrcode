const { faker } = require('@faker-js/faker');

const randomName = faker.person.fullName(); // Rowan Nikolaus
const randomEmail = faker.internet.email(); // Kassandra.Haley@erich.biz

const CSVHeaderPattern = 'Full Name,Phone,Email,URL,Image';
const CSVPattern = 'Alice Johnson,12345678989,alice.johnson@example.com,https://metsera.com,profile-pic-woman.png';

function replicateCSVPattern(CSVPattern) {
  const headerArray = CSVHeaderPattern.split(',');
  const patternArray = CSVPattern.split(',');

  let resultArray = [];

  for (let i = 0; i < patternArray.length; i++) {
    switch(headerArray[i]) {
      case 'Full Name':
        resultArray.push(faker.name.firstName() + ' ' + faker.name.lastName());
        break;
      case 'Phone':
        resultArray.push(faker.phone.phoneNumber());
        break;
      case 'Email':
        resultArray.push(faker.internet.email());
        break;
      default:
        resultArray.push(patternArray[i]);
        break;
    }
  }

  return resultArray.join(',');
}

console.log(replicateCSVPattern(CSVPattern));

