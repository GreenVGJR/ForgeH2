# ForgeH2

ForgeScript extension that performs `$httpRequest` over **HTTP/2** with automatic **HTTP/1.1 fallback**.

## Install

```
npm install forge.h2
```

## Setup

```js
const { ForgeClient } = require("@tryforge/forgescript");
const { ForgeH2 } = require("forge.h2");

const client = new ForgeClient({
  intents: ["Guilds", "GuildMessages", "MessageContent"],
  events: ["messageCreate"],
  prefixes: ["!"],
  extensions: [new ForgeH2()],
});

client.commands.add({
  name: "ip",
  type: "messageCreate",
  code: `$httpRequest[https://api.ipify.org?format=json;GET;result] $httpResult[ip] (via $httpProtocol)`,
});

client.login(process.env.BOT_TOKEN);
```

## Behaviour

- `$httpRequest[url;method;variable?]` keeps the exact core signature and semantics (headers/body/form/content-type helpers, env storage, status-code return, `$httpPing` compatible).
- `https://` URLs without multipart form are attempted over HTTP/2 (multiplexed sessions, one per origin). Anything else — `http://`, form uploads, H2 failure/timeout — falls back to the core `undici` fetch path.
- `$httpProtocol` (new, no brackets) returns the protocol used by the last request: `h2` or `http/1.1`.

## Notes

- Registration uses `FunctionManager.addMany()` because `ForgeExtension.load()` refuses to override existing natives.
- `$httpProtocol` intentionally omits `brackets` (like core `$httpPing`): `brackets: false` with zero args crashes core `FunctionManager.reload()`.
- The published `@tryforge/forgescript` npm package ships no `.d.ts` files, so this repo carries a minimal compile-time shim in `src/shims.d.ts` (erased on emit, real package used at runtime).
