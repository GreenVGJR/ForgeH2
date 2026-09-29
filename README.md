# ForgeH2

ForgeScript extension that performs `$httpRequest` over **HTTP/2** with automatic **HTTP/1.1 fallback**.

## Install

```
npm install --allow-git=all https://github.com/GreenVGJR/ForgeH2
```

## Functions

- `$httpRequest[url;method;variable?]` - HTTP/2 Fetch
- `$httpProtocol` - Return HTTP Protocol: `h2` or `http/1.1`
- `$httpRemoveHeader[name]` - Remove default headers or something i think