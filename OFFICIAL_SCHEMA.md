# This document will detail how SMM interacts with the official Nintendo servers
## This document exists in order to better understand the flow of things so that we can properly clone the servers, to make custom ones
## **NOTE: THIS DOCUMENT IS VERY INCOMPLETE. MANY THINGS ARE STILL UNKNOWN**
## **NOTE 2: MANY REQUESTS REQUIRE THE USAGE OF THE WIIU COMMON CLIENT CERTIFICATES. NOT ALL, BUT MANY. BECAUSE OF THIS, ASSUME THAT _ALL_ REQUESTS REQUIRE THEM (just to be safe). THE CERTS CAN BE DUMPED OR DOWNLOADED FROM https://ariankordi.net/cert/**


## Sections:
1. Authentication
    - Getting account PID
    - Password hashing
    - Logging in
        - Authentication flow
        - Generate access token
        - Grab profile
        - Generate nex token
        - Generate service token
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

### Authentication flow
The authentication schema flows in this order:
- Generate access token
- Grab profile
- Generate nex token
- Generate service token

### Generate access token
To login and start a session a POST request must be made to `https://account.nintendo.net/v1/api/oauth20/access_token/generate` with the payload:
```
grant_type: 'password',
user_id: 'ACCOUNT_NAME',
password: 'HASHED_PASSWORD',
password_type: 'hash'
```
where `ACCOUNT_NAME` is the username of the account and `HASHED_PASSWORD` is the hashed version of the user password (documented above)

With the payload the request must also contain console-specific header information (as accounts are tied to consoles. Some headers may not be needed):
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
If all valid, will return:
```xml
<OAuth20>
    <access_token>
        <token>ACCESS_TOKEN</token>
        <refresh_token>REFRESH_TOKEN</refresh_token>
        <expires_in>3600</expires_in>
    </access_token>
</OAuth20>
```

### Grab profile

SMM then makes an http request to `https://account.nintendo.net/v1/api/people/@me/profile` with the single header:
```
Authorization: Bearer ACCESS_TOKEN
```
If valid will return:
```xml
<person>
    <accounts>
        <account>
            <attributes>
                <attribute>
                    <id>83595077</id>
                    <name>environment</name>
                    <updated_by>USER</updated_by>
                    <value>PROD</value>
                </attribute>
            </attributes>
            <domain>ESHOP.NINTENDO.NET</domain>
            <type>INTERNAL</type>
            <username>316631748</username>
        </account>
    </accounts>
    <active_flag>Y</active_flag>
    <birth_date>1994-07-02</birth_date>
    <country>NL</country>
    <create_date>2017-11-18T06:39:54</create_date>
    <gender>M</gender>
    <language>en</language>
    <updated>2017-11-18T06:43:51</updated>
    <marketing_flag>N</marketing_flag>
    <off_device_flag>Y</off_device_flag>
    <pid>1750920395</pid>
    <email>
        <address>REMOVED</address>
        <id>49630709</id>
        <parent>N</parent>
        <primary>Y</primary>
        <reachable>Y</reachable>
        <type>DEFAULT</type>
        <updated_by>INTERNAL WS</updated_by>
        <validated>Y</validated>
        <validated_date>2017-11-18T06:48:32</validated_date>
    </email>
    <mii>
        <status>COMPLETED</status>
        <data>
        AAAAQMBhOOTAxKDg12lU642K64jOXgAAAEByAGUAZABtAHIAagB2AHMAAAAAAEBAAABrAQJohBQpE8YOwRATRg0ACCWAQUhQAAAAAAAAAAAAAAAAAAAAAAAAAAAAABM1
        </data>
        <id>1132528238</id>
        <mii_hash>1flcdk3hks29a</mii_hash>
        <mii_images>
            <mii_image>
                <cached_url>
                https://mii-secure.account.nintendo.net/1flcdk3hks29a_standard.tga
                </cached_url>
                <id>1132528305</id>
                <url>
                https://mii-secure.account.nintendo.net/1flcdk3hks29a_standard.tga
                </url>
                <type>standard</type>
            </mii_image>
        </mii_images>
        <name>redmrjvs</name>
        <primary>Y</primary>
    </mii>
    <region>1577058304</region>
    <tz_name>Europe/Amsterdam</tz_name>
    <user_id>redmrjvs</user_id>
    <utc_offset>3600</utc_offset>
</person>
```

### Generate nex token
The second token generated is the nex token, which is generated by making an http request to `https://account.nintendo.net/v1/api/provider/nex_token/@me?game_server_id=SERVER_ID`
where `SERVER_ID` is the ID of the game server (unknown origin), with these headers:
```
'Host': 'account.nintendo.net',
'X-Nintendo-Platform-ID': '1',
'X-Nintendo-Device-Type': '2',
'X-Nintendo-Device-ID': 'REMOVED',
'X-Nintendo-Serial-Number': 'REMOVED',
'X-Nintendo-System-Version': '0230',
'X-Nintendo-Region': '4',
'X-Nintendo-Country': 'NL',
'Accept-Language': 'en',
'X-Nintendo-Client-ID': 'a2efa818a34fa16b8afbc8a74eba3eda',
'X-Nintendo-Client-Secret': 'c91cdb5658bd4954ade78533a339cf9a',
'Accept': '*/*',
'X-Nintendo-FPD-Version': '0000',
'X-Nintendo-Environment': 'L1',
'X-Nintendo-Title-ID': 'SMM-TID',
'X-Nintendo-Unique-ID': 'SECTION-OF-SMM-TID',
'X-Nintendo-Application-Version': '0110',
'Authorization': 'Bearer ACCESS_TOKEN'
```
`SERVER_ID` is tied to the `'X-Nintendo-Unique-ID'` header in some way, however I have yet to figure out how.

Working example:
URL: `https://account.nintendo.net/v1/api/provider/nex_token/@me?game_server_id=1018DB00`
HEADERS:
```
'Host': 'account.nintendo.net',
'X-Nintendo-Platform-ID': '1',
'X-Nintendo-Device-Type': '2',
'X-Nintendo-Device-ID': 'REMOVED',
'X-Nintendo-Serial-Number': 'REMOVED',
'X-Nintendo-System-Version': '0230',
'X-Nintendo-Region': '4',
'X-Nintendo-Country': 'NL',
'Accept-Language': 'en',
'X-Nintendo-Client-ID': 'a2efa818a34fa16b8afbc8a74eba3eda',
'X-Nintendo-Client-Secret': 'c91cdb5658bd4954ade78533a339cf9a',
'Accept': '*/*',
'X-Nintendo-FPD-Version': '0000',
'X-Nintendo-Environment': 'L1',
'X-Nintendo-Title-ID': '000500001018DD00',
'X-Nintendo-Unique-ID': '018DD',
'X-Nintendo-Application-Version': '0110',
'Authorization': 'Bearer ACCESS_TOKEN'
```

If all valid, will return:
```xml
<nex_token>
    <host>GAME_SERVER_IP</host>
    <nex_password>REMOVED</nex_password>
    <pid>ACCOUNT_PID</pid>
    <port>GAME_SERVER_PORT</port>
    <token>NEX_TOKEN</token>
</nex_token>
```

### Generate service token
The final token generated is the service token. This, along with the access token, is used for pretty much every other SMM request (except course downloading, see below). Service tokens seem to last forever, never invalidate/expire, and do _NOT_ seem to be tied to an account (my service token can be used with any access token). To generate a service token, an http request is made to `https://account.nintendo.net/v1/api/provider/service_token/@me?client_id=CLIENT_ID` where `CLIENT_ID` is of unknown origin (originally thought the be the UUID of the account, however after using the UUID found in the `account.dat` this isn't the case. We do not know where this ID comes from yet). The request requires these headers:
```
X-Nintendo-Platform-ID: 1
X-Nintendo-Device-Type: 2
X-Nintendo-Device-ID: REMOVED
X-Nintendo-Serial-Number: REMOVED
X-Nintendo-System-Version: 0230
X-Nintendo-Region: 4
X-Nintendo-Country: NL
Accept-Language: en
X-Nintendo-Client-ID: a2efa818a34fa16b8afbc8a74eba3eda
X-Nintendo-Client-Secret: c91cdb5658bd4954ade78533a339cf9a
Accept: */*
X-Nintendo-FPD-Version: 0000
X-Nintendo-Environment: L1
X-Nintendo-Title-ID: SMM-TID
X-Nintendo-Unique-ID: SECTION-OF-SMM-TID
X-Nintendo-Application-Version: 0110
Authorization: Bearer ACCESS_TOKEN
```

Working example:
URL: `https://account.nintendo.net/v1/api/provider/service_token/@me?client_id=87cd32617f1985439ea608c2746e4610`
HEADERS:
```
X-Nintendo-Platform-ID: 1
X-Nintendo-Device-Type: 2
X-Nintendo-Device-ID: REMOVED
X-Nintendo-Serial-Number: REMOVED
X-Nintendo-System-Version: 0230
X-Nintendo-Region: 4
X-Nintendo-Country: NL
Accept-Language: en
X-Nintendo-Client-ID: a2efa818a34fa16b8afbc8a74eba3eda
X-Nintendo-Client-Secret: c91cdb5658bd4954ade78533a339cf9a
Accept: */*
X-Nintendo-FPD-Version: 0000
X-Nintendo-Environment: L1
X-Nintendo-Title-ID: 000500001018DD00
X-Nintendo-Unique-ID: 018DD
X-Nintendo-Application-Version: 0110
Authorization: Bearer ACCESS_TOKEN
```

If all valid, will return:
```xml
<service_token>
    <token>SERVICE_TOKEN</token>
</service_token>
```

# Initial course list
We have no idea where this comes from, still researching. We spent several hours trying different methods, including sniffing requests all the way from console start. Once SMM starts it starts to download courses and unpacking the streams to get the images and title/maker. The download URLs are the same kind as with 100man, however 100man uses a course pickup list.

# 100man
When 100man starts, SMM hits `https://wup-ama.app.nintendo.net/api/v1/pickup/DIFFICULTY` where `DIFFICULTY` is `easy`, `normal`, `expert` or `super_expert`. The request only requires one header, `X-Nintendo-ServiceToken` set to the generated SERVICE_TOKEN. WUP-AMA will respond with an XML list of 400, 8 digit course IDs. SMM picks one of these at random.


# Course IDs

Course IDs come in 2 formats:
- A 19-digit UUID, and
- An 8 digit decimal ID

When a course is uploaded, SMM will generate a 19-digit UUID split into 4 sections `xxxx-0000-xxxx-xxxx`. The second section seems to always be `0000`. Courses are stored under the 8 digit decimal ID, however. To convert the 19-digit UUID to the 8 digit decimal ID, remove the first two sections of the UUID (`xxxx-0000`), and remove the remaining hyphen. Treat this as HEX, and convert to decimal. For example, UUID `F837-0000-02A1-2A9C` when converted will be `44116636` (`02A12A9C` in HEX)


# Course URL

Once SMM picks an ID and converts it to the 8 digit decimal ID (if needed), it makes an http request to `https://d2sno3mhmk1ekx.cloudfront.net/10.WUP_AMAJ_datastore/ds/1/data/LONG-ID` where `LONG-ID` is the selected 8 digit decimal ID prefixed with `000` and suffixed with `-00001`. For example, if the course ID was `44116636` then the `LONG-ID` would be `00044116636-00001`, making the URL `https://d2sno3mhmk1ekx.cloudfront.net/10.WUP_AMAJ_datastore/ds/1/data/00044116636-00001`. The courses are stored on (a?) AWS bucket(s?), and the download URLs are AWS Canned-signed URLs. The `Key-Pair-Id` is `APKAJNJMHZCDH3VQ74HQ`. The private key is still unknown, and will likely never be found out. Because of this we cannot generate signatures, and thus cannot sign the Canned URLs.
Example `Policy` used for signing:
```json
{
    "Statement":[
        {
            "Resource":"https://d2sno3mhmk1ekx.cloudfront.net/10.WUP_AMAJ_datastore/ds/1/data/00044116636-00001",
            "Condition":{
                "DateLessThan":{
                    "AWS:EpochTime":1513886777
                }
            }
        }
    ]
}
```
More information on AWS Canned-signed URLs and Signatures:
- [Canned-signed URLs](http://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-creating-signed-url-canned-policy.html)
- [Signatures](http://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CreateURL_PHP.html)
- [NodeJS specific signing](https://aws.amazon.com/blogs/developer/creating-amazon-cloudfront-signed-urls-in-node-js/)



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