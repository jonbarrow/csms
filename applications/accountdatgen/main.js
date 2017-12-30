let inquirer = require('inquirer'),
    fs = require('fs'),
    got = require('got'),
    XMLParser = require('pixl-xml'),
    country_codes = require('./country_codes.js'),
    cert = {
        // WiiU-common certificates. Can be dumped or found online
        key: fs.readFileSync(__dirname + '/certs/wiiu-common.key'),
        cert: fs.readFileSync(__dirname + '/certs/wiiu-common.crt')
    };

function hashPassword(password, pid) {
    let buff1 = require('python-struct').pack('<I', pid);
    let buff2 = Buffer.from(password).toString('ascii');

    let unpacked = new Buffer(bufferToHex(buff1) + '\x02eCF' + buff2, 'ascii'),
        hashed = require('crypto').createHash('sha256').update(unpacked).digest().toString('hex');

    return hashed;
}

function bufferToHex(buff) {
    let result = '',
        arr = buff.toString('hex').match(/.{1,2}/g);
    for (var i=0;i<arr.length;i++) {
        let char = arr[i],
            char_code = char.charCodeAt();
        result += String.fromCharCode(parseInt(char, 16));
    }
    result.replace(/\\/g, '&#92;');
    return result;
}

function getPID(username, cb) {

    let headers = {
        'X-Nintendo-Platform-ID': '1',
        'X-Nintendo-Device-Type': '2',
        'X-Nintendo-Client-ID': 'a2efa818a34fa16b8afbc8a74eba3eda', 
        'X-Nintendo-Client-Secret': 'c91cdb5658bd4954ade78533a339cf9a',
        'X-Nintendo-FPD-Version': '0000',
        'X-Nintendo-Environment': 'L1',
    }

    let options = {
        method: 'GET',
        key: cert.key,
        cert: cert.cert,
        rejectUnauthorized: false,
        port: 443,
        headers: headers
    };

    apiRequest('https://account.nintendo.net/v1/api/admin/mapped_ids?input_type=user_id&output_type=pid&input=' + username, options, (body) => {
        let xml;
        try {
            xml = XMLParser.parse(body);
        } catch (error) {
            console.log('oops 1')
            throw new Error(error);
        }
        cb(xml.mapped_id.out_id);
    });
}

async function apiRequest(uri, options, cb) {
    let response;
    try {
        response = await got(uri, options);
    } catch (error) {
        throw new Error(error.response.body);
    }
    
    cb(response.body);
}

function parseToFile(obj) {
    const fs = require('fs');
    var path = __dirname + "\\account";
    if (fs.existsSync(path + '.dat')) {
        let i = 1;
        while (fs.existsSync(path + i + '.dat')) {
            i++;
        }
        path += i + '.dat';
    } else {
        path += '.dat';
    }
    var outputString = 'AccountInstance_00000000';
    for (let key in obj) {
        outputString += '\n' + key + '=' + obj[key];
    }
    fs.writeFile(path, outputString, function(err) {
        if(err) {
            return console.log(err);
        }
    
        console.log("Account file saved at: " + path);
    }); 
}

// get the input
(async () => {
    let answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'username',
            message: 'Enter username'
        },
        {
            type: 'password',
            name: 'password',
            message: 'Enter password'
        },
        {
            type: 'list',
            name: 'country',
            message: 'Pick your console country',
            choices: country_codes
        }
    ]);
    
    getPID(answers.username, (pid) => {
        let hash = hashPassword(answers.password, pid),
            output = {
                Country: answers.country.toString(16),
                AccountPasswordCache: hash,
                IsPasswordCacheEnabled: '1',
                AccountId: answers.username,
                PersistentId: '80000001'
            };
                 
        parseToFile(output);
    });
})();