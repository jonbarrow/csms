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
4. Course IDs
5. Course URL
6. Course Format (packed)


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
        // WiiU-common certificates. Can be dumped or found online
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
'X-Nintendo-Serial-Number': 'REMOVED', // unknown origin. Found by sniffing
'X-Nintendo-System-Version': '0230', // unknown origin. Found by sniffing
'X-Nintendo-Region': '4', // console region (4 is EUR)
'X-Nintendo-Country': 'NL', // console country
'Accept-Language': 'en', // lang
'X-Nintendo-Client-ID': 'a2efa818a34fa16b8afbc8a74eba3eda', // common to all WiiU consoles. We assume these are used to "validate" that it is a WiiU making the request
'X-Nintendo-Client-Secret': 'c91cdb5658bd4954ade78533a339cf9a', // common to all WiiU consoles. We assume these are used to "validate" that it is a WiiU making the request
'X-Nintendo-FPD-Version': '0000', // unknown origin. Found by sniffing
'X-Nintendo-Environment': 'L1', // unknown origin. Found by sniffing
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


# Course IDs

Course IDs come in 2 formats:
- A 19-digit UUID, and
- An 8 digit decimal ID

When a course is uploaded, SMM will generate a 19-digit UUID split into 4 sections `xxxx-0000-xxxx-xxxx`. The second section seems to always be `0000`. Courses are stored under the 8 digit decimal ID, however. To convert the 19-digit UUID to the 8 digit decimal ID, remove the first two sections of the UUID (`xxxx-0000`), and remove the remaining hyphen. Treat this as HEX, and convert to decimal. For example, UUID `F837-0000-02A1-2A9C` when converted will be `44116636` (`02A12A9C` in HEX)


# Course URL

Once SMM picks an ID and converts it to the 8 digit decimal ID (if needed), it makes an http request to `https://d2sno3mhmk1ekx.cloudfront.net/10.WUP_AMAJ_datastore/ds/1/data/LONG-ID` where `LONG-ID` is the selected 8 digit decimal ID prefixed with `000` and suffixed with `-00001`. For example, if the course ID was `44116636` then the `LONG-ID` would be `00044116636-00001`, making the URL `https://d2sno3mhmk1ekx.cloudfront.net/10.WUP_AMAJ_datastore/ds/1/data/00044116636-00001`. The courses are stored on AWS (a?) bucket(s?), and the download URLs are AWS Canned-signed URLs. The `Key-Pair-Id` is `APKAJNJMHZCDH3VQ74HQ`. The private key is still unknown, and will likely never be found out. Because of this we cannot generate signatures, and thus cannot sign the Canned URLs.


# Course Format (packed)

The packed course (when first downloaded) is in an ASH file which contains 4 other ASH files (2 images and 2 for the course (one sub one overworld)). The first and fourth ASH are the course images. The first ASH is the preview, while the fourth is the thumbnail. ASH 2 and 3 are the course itself. So far we know nothing about the ASH format these are stored in, and I have been using `ASH.exe` to unpack the ASHs. ASH 1 and 4 (images) are unpacked into ARC files. The image can be extracted after the first 8 bits of each. ASH 2 and 3 are not extracted to ARCs and are instead already usable course cdt files.

**Unpacking Example (NodeJS)**
```JavaScript
let fs = require('fs'),
    readline = require('readline'),
    child_process = require('child_process');

async function unpackCourse(course) {
    await splitASH(course);
    
    child_process.spawnSync('ASH.exe', ['ASH1']);
    child_process.spawnSync('ASH.exe', ['ASH2']);
    child_process.spawnSync('ASH.exe', ['ASH3']);
    child_process.spawnSync('ASH.exe', ['ASH4']);

    await extractImages();
    return new Promise((resolve) => {
        resolve();
    });
}

function splitASH(ash) {
    return new Promise((resolve, reject) => {
        fs.readFile(ash, (error, data) => {
            if (error) return reject(error);

            let indexes = getIndexes(data, '\x41\x53\x48\x30'),
                ash1 = data.subarray(0, indexes[1]),
                ash2 = data.subarray(indexes[1], indexes[2]),
                ash3 = data.subarray(indexes[2], indexes[3]),
                ash4 = data.subarray(indexes[3]);

            fs.writeFileSync(__dirname + '/ASH1', ash1);
            fs.writeFileSync(__dirname + '/ASH2', ash2);
            fs.writeFileSync(__dirname + '/ASH3', ash3);
            fs.writeFileSync(__dirname + '/ASH4', ash4);

            resolve();
        });
    });
}

function extractImages() {
    var img1 = fs.readFileSync('ASH1.arc'),
        img2 = fs.readFileSync('ASH4.arc'),
        img1 = img1.subarray(8),
        img2 = img2.subarray(8);

    fs.writeFileSync('ASH1.jpeg', img1);
    fs.writeFileSync('ASH4.jpeg', img2);
    return new Promise((resolve) => {
        resolve();
    });
    
}

function getIndexes(array, string) {
    let indexes = [], i;
    while ((i = array.indexOf(string, i+1)) != -1){
        indexes.push(i);
    }
    return indexes;
}


// 'course.ash' is assumed to be a valid course downloaded from the SMM AWS servers
unpackCourse('course.ash').then(() => {
    console.log('done');
});

```