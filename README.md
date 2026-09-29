# ForgeH2

ForgeScript extension that performs `$httpRequest` over **HTTP/2** with automatic **HTTP/1.1 fallback**.

## Install

```
npm install forge.h2
```

## Functions

- `$httpProtocol` returns the protocol used by the last request: `h2` or `http/1.1`.