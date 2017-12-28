const prompt = require('prompt'),
    fs = require('fs'),
    got = require('got'),
    XMLParser = require('pixl-xml'),
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

function getPID(username,callback) {
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

    apiRequest('https://account.nintendo.net/v1/api/admin/mapped_ids?input_type=user_id&output_type=pid&input=' + username, options, (body,callb) => {
        let xml;
        try {
            xml = XMLParser.parse(body);
        } catch (error) {
            throw new Error(error);
        }
        callb(xml.mapped_id.out_id);
    },callback);
}

async function apiRequest(uri, options, cb, cb2) {
    try {
        let response = await got(uri, options);
        cb(response.body,cb2);
    } catch (error) {
        throw new Error(error.response.body);
    }
}

function parseToFile(obj) {
    const fs = require('fs');
    var path = __dirname + "/account";
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

prompt.start();

console.log('Please fill in the username, password and the countryCode of the NNID that is linked with your console where you got the otp from. \n For country codes go here: http://wiibrew.org/wiki/Country_Codes');

prompt.get(['username', 'password','countryCode'], function (err, result) {

    //parse data into a file

    var user = result.username.trim(),
        pass = result.password.trim(),
        cc = parseInt(result.countryCode.trim()).toString(16);

    getPID(user,function(pid) {
        const hash = hashPassword(pass,pid);
        var output = {
            Country: cc,
            AccountPasswordCache: hash,
            IsPasswordCacheEnabled: '1',
            AccountId: user,
            PersistentId: '80000001'
        };
        parseToFile(output);
    });

});