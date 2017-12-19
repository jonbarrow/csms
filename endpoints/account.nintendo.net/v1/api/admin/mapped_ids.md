# [GET] https://account.nintendo.net/v1/api/admin/mapped_ids

## *Requires client certificate to access

## Description
Takes a list input and maps out the requested output

## Possible query components:
- input_type
    - user_id (Nintendo account username)
- output_type
    - pid (Nintendo account PID)
- input

## Valid examples
- https://account.nintendo.net/v1/api/admin/mapped_ids?input_type=user_id&output_type=pid&input=redmrjvs
- https://account.nintendo.net/v1/api/admin/mapped_ids?input_type=user_id&output_type=pid&input=redmrjvs,redducks

# Required headers
```
X-Nintendo-Client-ID: a2efa818a34fa16b8afbc8a74eba3eda
X-Nintendo-Client-Secret: c91cdb5658bd4954ade78533a339cf9a
```

# Success
### Response
```xml
<mapped_ids>
    <mapped_id>
        <in_id>input_1</in_id>
        <out_id>output_1</out_id>
    </mapped_id>
    <mapped_id>
        <in_id>input_2</in_id>
        <out_id>output_2</out_id>
    </mapped_id>
    [continued for each input]
</mapped_ids>
```
### Headers
```
HTTP/1.1 200 OK
Server: Nintendo 3DS (http)
X-Nintendo-Date: 1513722038314
Content-Type: application/xml;charset=UTF-8
Content-Length: 226
Date: Tue, 19 Dec 2017 22:20:38 GMT
```
- `X-Nintendo-Date` is the current timestamp in milliseconds
- `Server` is always `Nintendo 3DS (http)` even on WiiU and even if over https
- `Date` is `X-Nintendo-Date` converted

# Errors
## 0004
### Cause
Missing one of the required headers
### Response
```xml
<errors>
    <error>
        <cause>client_id</cause>
        <code>0004</code>
        <message>
        API application invalid or incorrect application credentials
        </message>
    </error>
</errors>
```
### Headers
```
HTTP/1.1 401 Unauthorized
X-Nintendo-Date: 1513723471419
Server: Nintendo 3DS (http)
Content-Type: text/xml
Content-Length: 152
Date: Tue, 19 Dec 2017 22:44:31 GMT
```

## 1600
### Cause
- Missing `input_type`
- Missing `output_type`
- Missing `input`
### Response
```xml
<errors>
    <error>
        <cause>Bad Request</cause>
        <code>1600</code>
        <message>Unable to process request</message>
    </error>
</errors>
```
### Headers
```
HTTP/1.1 400 Bad Request
Server: Nintendo 3DS (http)
X-Nintendo-Date: 1513723356049
Content-Type: application/xml;charset=UTF-8
Content-Length: 174
Date: Tue, 19 Dec 2017 22:42:35 GMT
X-Cnection: close
```
- `X-Cnection` is not a misspelling
