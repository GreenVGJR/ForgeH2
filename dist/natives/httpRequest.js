"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const undici_1 = require("undici");
const h2client_js_1 = require("../util/h2client.js");
exports.default = new forgescript_1.NativeFunction({
    name: "$httpRequest",
    version: "1.0.0",
    description: "Performs an http request over HTTP/2 with HTTP/1.1 fallback, returns the status code",
    output: forgescript_1.ArgType.Number,
    args: [
        {
            name: "url",
            description: "The url to perform this request to",
            type: forgescript_1.ArgType.String,
            rest: false,
            required: true,
        },
        {
            name: "method",
            description: "The method to use",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.String,
        },
        {
            name: "variable",
            description: "Environment variable name to load the response to",
            rest: false,
            required: false,
            type: forgescript_1.ArgType.String,
        },
    ],
    brackets: true,
    unwrap: true,
    async execute(ctx, [url, method, name]) {
        name ??= "result";
        if (ctx.http.response)
            delete ctx.http.response;
        const msStart = performance.now();
        // Fast path: HTTPS without multipart form -> try HTTP/2 first.
        const canTryH2 = typeof url === "string" && /^https:/i.test(url) && !ctx.http.form;
        if (canTryH2) {
            try {
                const headers = { ...(ctx.http.headers ?? {}) };
                const bodyBuf = ctx.http.body !== undefined ? Buffer.from(String(ctx.http.body)) : undefined;
                const res = await (0, h2client_js_1.requestViaH2)(url, method, headers, bodyBuf);
                const ms = performance.now() - msStart;
                const contentType = res.headers.get("content-type")?.split(";")[0]?.trim();
                const overrideType = ctx.http.contentType;
                ctx.clearHttpOptions();
                ctx.http.response = {
                    headers: res.headers,
                    ping: ms,
                    protocol: res.protocol,
                };
                const text = res.body.toString("utf-8");
                if (overrideType !== undefined) {
                    const kind = forgescript_1.HTTPContentType[overrideType].toLowerCase();
                    if (kind === "json") {
                        try {
                            ctx.setEnvironmentKey(name, JSON.parse(text));
                        }
                        catch {
                            ctx.setEnvironmentKey(name, text);
                        }
                    }
                    else {
                        ctx.setEnvironmentKey(name, text);
                    }
                }
                else if (contentType === "application/json") {
                    try {
                        ctx.setEnvironmentKey(name, JSON.parse(text));
                    }
                    catch {
                        ctx.setEnvironmentKey(name, text);
                    }
                }
                else if (contentType?.includes("image")) {
                    ctx.setEnvironmentKey(name, res.body.toString("base64"));
                }
                else {
                    ctx.setEnvironmentKey(name, text);
                }
                return this.success(res.status);
            }
            catch {
                // Fall through to HTTP/1.1 below.
            }
        }
        // Fallback: identical behaviour to core $httpRequest (undici fetch).
        const req = await (0, undici_1.fetch)(url, {
            ...ctx.http,
            method,
            body: ctx.http.body ?? ctx.http.form,
        }).catch(ctx.noop);
        const ms = performance.now() - msStart;
        if (!req)
            return this.success(void ctx.clearHttpOptions());
        const contentType = req.headers.get("content-type")?.split(";")[0];
        const overrideType = ctx.http.contentType;
        ctx.clearHttpOptions();
        ctx.http.response = {
            headers: req.headers,
            ping: ms,
            protocol: "http/1.1",
        };
        if (overrideType !== undefined) {
            const kind = forgescript_1.HTTPContentType[overrideType].toLowerCase();
            if (kind === "json") {
                ctx.setEnvironmentKey(name, await req.json());
            }
            else {
                ctx.setEnvironmentKey(name, await req.text());
            }
        }
        else {
            if (contentType === "application/json") {
                ctx.setEnvironmentKey(name, await req.json());
            }
            else if (contentType?.includes("image")) {
                ctx.setEnvironmentKey(name, await req.arrayBuffer().then((x) => Buffer.from(x).toString("base64")));
            }
            else {
                ctx.setEnvironmentKey(name, await req.text());
            }
        }
        return this.success(req.status);
    },
});
//# sourceMappingURL=httpRequest.js.map