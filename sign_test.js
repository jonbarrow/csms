let cfsign = require('aws-cloudfront-sign');

let options = {
    keypairId: 'APKAJNJMHZCDH3VQ74HQ',
    // We need to figure out this private key issue
    privateKeyPath: __dirname + '/certs/ccerts/WIIU_ACCOUNT_1_RSA_KEY.key',
    expireTime: (new Date().getTime() + 30000)
}

let signed_url = cfsign.getSignedUrl(
    'https://d2sno3mhmk1ekx.cloudfront.net/10.WUP_AMAJ_datastore/ds/1/data/00044116636-00001', 
    options
);

console.log(signed_url);