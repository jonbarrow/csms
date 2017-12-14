# This document will detail how SMM interacts with the official Nintendo servers
## This document exists in order to better understand the flow of things so that we can properly clone the servers, to make custom ones
## **NOTE: THIS DOCUMENT IS VERY INCOMPLETE. MANY THINGS ARE STILL UNKNOWN**


## Sections:
1. Authentication
    - Getting account PID
    - Password hashing
    - Logging in
2. Initial course list
3. 100man


# Authentication
Before any requests can be made the user must first log in and authenticate with Nintendo. This starts a session and gives us an access token and a service token.

**NOTE: ACCOUNTS ARE TIED TO A CONSOLE. MEANING MANY OF THE HEADERS REQUIRED FOR AUTHENTICATION ARE CONSOLE-SPECIFIC. BECAUSE OF THIS, WE CANNOT MAKE ARBITRARY LOGIN REQUESTS USING JUST A USERNAME AND PASSWORD**


## Getting account PID
To get an account PID you simply make an HTTP request to `https://account.nintendo.net/v1/api/admin/mapped_ids?input_type=user_id&output_type=pid&input=ACCOUNT_NAME` with some validation headers, where `ACCOUNT_NAME` is the username of the account

**Example (NodeJS)**
```JavaScript

let fs = require('fs'),
    got = require('got'),
    XMLParser = require('pixl-xml'),
    cert = {
        // WiiU-common certificates. Can be dumped or found online, will not redistribite
        key: fs.readFileSync(__dirname + '/ssl/nintendo/wiiu-common.key'),
        cert: fs.readFileSync(__dirname + '/ssl/nintendo/wiiu-common.crt')
    };

function getPID(username) {
    /*
    `X-Nintendo-Client-ID` and `X-Nintendo-Client-Secret` are shared between all consoles. The names of these headers can be misleading
    */
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
            throw new Error(error);
        }
        return xml.mapped_id.out_id;
    });
}

async function apiRequest(uri, options, cb) {
    try {
        let response = await got(uri, options);
        cb(response.body);
    } catch (error) {
        throw new Error(error.response.body);
    }
}
```


## Password hashing
Nintendo will only accept hashed passwords. In the past they accepted un-hashed ones, but this has since changed.

Each password must be a `sha256` hash of 2 parts. Part 1 is a little-endian packed integer made of the account PID, represented in HEX. Part 2 is the ASCII of the users password. The 2 parts are separated by `\x02eCF`

**Example (NodeJS)**
```JavaScript
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
```