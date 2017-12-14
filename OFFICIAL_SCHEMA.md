# This document will detail how SMM interacts with the official Nintendo servers
## This document exists in order to better understand the flow of things so that we can properly clone the servers, to make custom ones
## **NOTE: THIS DOCUMENT IS VERY INCOMPLETE. MANY THINGS ARE STILL UNKNOWN**
## **NOTE 2: MANY REQUESTS REQUIRE THE USAGE OF THE WIIU COMMON CLIENT CERTIFICATES. NOT ALL, BUT MANY. BECAUSE OF THIS, ASSUME THAT _ALL_ REQUESTS REQUIRE THEM (just to be safe). THE CERTS CAN BE DUMPED OR DOWNLOADED FROM https://ariankordi.net/cert/**


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

## Logging in
To login and start a session a POST request must be made to `https://account.nintendo.net/v1/api/oauth20/access_token/generate` with the payload:
```
grant_type: 'password',
user_id: 'ACCOUNT_NAME',
password: 'HASHED_PASSWORD',
password_type: 'hash'
```
where `ACCOUNT_NAME` is the username of the account and `HASHED_PASSWORD` is the hashed version of the user password (documented above)

With the payload the request must also contain console-specific header information (as accounts are tied to consoles):
```
'X-Nintendo-Platform-ID': '1', // unknown origin. Found by sniffing
'X-Nintendo-Device-Type': '2', // unknown origin. Found by sniffing
'X-Nintendo-Device-ID': 'REMOVED', // unknown origin. Found by sniffing
'X-Nintendo-Serial-Number': 'REMOVED',
'X-Nintendo-System-Version': '0230', // unknown origin. Found by sniffing
'X-Nintendo-Region': '4', // console region (4 is EUR)
'X-Nintendo-Country': 'NL', // console country
'Accept-Language': 'en', // lang
'X-Nintendo-Client-ID': 'a2efa818a34fa16b8afbc8a74eba3eda',
'X-Nintendo-Client-Secret': 'c91cdb5658bd4954ade78533a339cf9a',
'X-Nintendo-FPD-Version': '0000',
'X-Nintendo-Environment': 'L1',
'X-Nintendo-Title-ID': '0005001010040200', // Title ID of the application/game making the request. `0005001010040200` is the system menu
'X-Nintendo-Unique-ID': '00402', // unknown origin. Found by sniffing
'X-Nintendo-Application-Version': '00C4', // unknown origin. Found by sniffing
'X-Nintendo-Device-Cert': 'REMOVED', // unknown origin. Found by sniffing
'Content-type': 'application/x-www-form-urlencoded',
'Content-Length': '129' // unknown origin. Found by sniffing
```

# Initial course list
We have no idea where this comes from, still researching. We spent several hours trying different methods, including sniffing requests all the way from console start. Once SMM starts it starts to download courses and unpacking the streams to get the images and title/maker. The download URLs are the same kind as with 100man, however 100man uses a course pickup list.

# 100man
When 100man starts, SMM hits `https://wup-ama.app.nintendo.net/api/v1/pickup/DIFFICULTY` where `DIFFICULTY` is `easy`, `normal`, `expert` or `super_expert`. The request only requires one header, `X-Nintendo-ServiceToken` (we have not documented how to get this token yet. We forgot how we originally got it, however the token lasts forever and doesn't seem to invalidate or expire). WUP-AMA will respond with an XML list of 400, 8 digit course IDs. SMM picks one of these at random.

Once SMM picks an ID, it makes an http request to `https://d2sno3mhmk1ekx.cloudfront.net/10.WUP_AMAJ_datastore/ds/1/data/LONG-ID` where `LONG-ID` is the selected ID prefixed with `000` and suffixed with `-00001`. For example, if the course ID was `12345678` then the `LONG-ID` would be `00012345678-00001`, making the URL `https://d2sno3mhmk1ekx.cloudfront.net/10.WUP_AMAJ_datastore/ds/1/data/00012345678-00001`. The request has the parameters `Expires`, `Signature` and `Key-Pair-Id`. `Expires` is a timestamp set in an unknown distance (several weeks from my testing). `Key-Pair-Id` is always `APKAJNJMHZCDH3VQ74HQ`. `Signature` is of unknown origin, and so far cannot be generated. An example `Signature` (taken from a real request) is:
```
K1eMCCA8RqJKqrGVXcMpull-tTWt7QTtM7NszXOWWIZyBV84jC9GVobDe9VaZv--9~0sLXjOvKATbQnUuusjhAT2~WsCcNHfhgFtKzcH2x-g1d0tYVqpbG0fSxLJ3s-DTBb1gu7sgfKYJYegdjTOKCBdH8wnJV2AhvEyC29DUAzVH6vZ6dNyETi63a9r4R5hCh~2XrblDOx00vJhhUhwBTVNOnTXrRw9FvGfIB4lj8QZ2Gqb1vDwgkeEO8i4TBu2N0mLV57CdqYNO-~nwkjTaAs9G9MP7BhI4zsAoy8bazccGxT-GCS6gr9IMPf8OoQ5muNknAdRKIT1GTSA44eKKA__
```

The only patterns I have noticed with `Signature` is the signature seems to always be broken up into 5 parts, separated by tilde, and the final part always ends in `__`

The request then downloads the course. The course is in an ASH file which contains 4 other ASH files (2 images and 2 for the course (one sub one overworld))