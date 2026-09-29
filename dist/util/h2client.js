"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSession = getSession;
exports.closeAllSessions = closeAllSessions;
exports.withDefaultHeaders = withDefaultHeaders;
exports.decompress = decompress;
exports.requestViaH2 = requestViaH2;
const http2_1 = __importDefault(require("http2"));
const zlib_1 = __importDefault(require("zlib"));
const undici_1 = require("undici");
const sessions = new Map();
function originOf(url) {
    return `${url.protocol}//${url.host}`;
}
function getSession(origin) {
    const existing = sessions.get(origin);
    if (existing && !existing.destroyed && !existing.closed)
        return existing;
    if (existing)
        sessions.delete(origin);
    const session = http2_1.default.connect(origin);
    sessions.set(origin, session);
    session.on("error", () => {
        if (sessions.get(origin) === session)
            sessions.delete(origin);
        try {
            session.destroy();
        }
        catch {
            /* noop */
        }
    });
    session.on("close", () => {
        if (sessions.get(origin) === session)
            sessions.delete(origin);
    });
    return session;
}
function closeAllSessions() {
    for (const [, session] of sessions) {
        try {
            session.close();
        }
        catch {
            /* noop */
        }
    }
    sessions.clear();
}
const FORBIDDEN = new Set([
    "connection",
    "keep-alive",
    "proxy-connection",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
]);
// The headers undici's fetch sends on every request; node:http2 sends none.
const DEFAULT_HEADERS = {
    accept: "*/*",
    "accept-encoding": `br, gzip, deflate${typeof zlib_1.default.zstdDecompress === "function" ? ", zstd" : ""}`,
    "accept-language": "*",
    "sec-fetch-mode": "cors",
    "user-agent": "undici",
};
/** Fills in missing defaults. Headers the caller set always win. */
function withDefaultHeaders(headers, removed) {
    const out = {};
    const given = new Set(Object.keys(headers).map((k) => k.toLowerCase()));
    for (const [k, v] of Object.entries(DEFAULT_HEADERS)) {
        if (!given.has(k) && !removed?.has(k))
            out[k] = v;
    }
    return Object.assign(out, headers);
}
/** Decompresses per `content-encoding`, which fetch does transparently. */
function decompress(body, encoding) {
    const enc = (encoding ?? "").trim().toLowerCase();
    if (!body.length || !enc || enc === "identity")
        return Promise.resolve(body);
    return new Promise((resolve, reject) => {
        const done = (err, out) => (err ? reject(err) : resolve(out));
        if (enc === "gzip" || enc === "x-gzip")
            zlib_1.default.gunzip(body, done);
        else if (enc === "deflate")
            zlib_1.default.inflate(body, done);
        else if (enc === "br")
            zlib_1.default.brotliDecompress(body, done);
        else if (enc === "zstd" && typeof zlib_1.default.zstdDecompress === "function")
            zlib_1.default.zstdDecompress(body, done);
        else
            resolve(body);
    });
}
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
/** Single H2 round-trip, no redirect handling. */
function requestOnce(url, method, headers, body, timeoutMs) {
    return new Promise((resolve, reject) => {
        let session;
        try {
            session = getSession(originOf(url));
        }
        catch (err) {
            reject(err);
            return;
        }
        const outHeaders = {
            ":method": method.toUpperCase(),
            ":path": `${url.pathname}${url.search}`,
            ":scheme": "https",
            ":authority": url.host,
        };
        for (const [k, v] of Object.entries(headers)) {
            const name = k.toLowerCase();
            if (FORBIDDEN.has(name) || name.startsWith(":"))
                continue;
            outHeaders[name] = v;
        }
        let req;
        try {
            req = session.request(outHeaders);
        }
        catch (err) {
            reject(err);
            return;
        }
        const timer = setTimeout(() => {
            try {
                req.close(http2_1.default.constants.NGHTTP2_CANCEL);
            }
            catch {
                /* noop */
            }
            reject(new Error("H2 request timed out"));
        }, timeoutMs);
        let status = 0;
        const rawHeaders = {};
        const chunks = [];
        req.on("response", (headers) => {
            for (const [k, v] of Object.entries(headers)) {
                if (k === ":status") {
                    status = Array.isArray(v) ? Number(v[0]) : Number(v);
                    continue;
                }
                if (v === undefined)
                    continue;
                rawHeaders[k] = v;
            }
        });
        req.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on("end", () => {
            clearTimeout(timer);
            const out = new undici_1.Headers();
            for (const [k, v] of Object.entries(rawHeaders)) {
                if (Array.isArray(v)) {
                    for (const item of v)
                        out.append(k, item);
                }
                else {
                    out.append(k, v);
                }
            }
            const socket = session.socket;
            const raw = Buffer.concat(chunks);
            const encoding = out.get("content-encoding");
            decompress(raw, encoding)
                .then((body) => {
                if (encoding && body !== raw) {
                    out.delete("content-encoding");
                    out.delete("content-length");
                }
                resolve({
                    status,
                    headers: out,
                    body,
                    protocol: socket?.alpnProtocol || "h2",
                });
            })
                .catch(reject);
        });
        req.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
        req.on("close", () => {
            clearTimeout(timer);
        });
        try {
            if (body && body.length)
                req.write(body);
            req.end();
        }
        catch (err) {
            clearTimeout(timer);
            reject(err);
        }
    });
}
/**
 * HTTP/2 request with redirect following and transparent decompression.
 *
 * @param redirectLimit max redirects to follow. `0` disables.
 */
async function requestViaH2(urlStr, method, headers, body, timeoutMs = 15000, redirectLimit = 5, removed) {
    const url = new URL(urlStr);
    if (url.protocol !== "https:")
        throw new Error("H2 requires https:");
    const merged = withDefaultHeaders(headers, removed);
    let current = url;
    let currentMethod = method.toUpperCase();
    let currentBody = body;
    for (let hop = 0;; hop++) {
        const res = await requestOnce(current, currentMethod, merged, currentBody, timeoutMs);
        if (!REDIRECT_STATUS.has(res.status))
            return res;
        const location = res.headers.get("location");
        if (!location)
            return res;
        if (redirectLimit <= 0 || hop >= redirectLimit)
            throw new Error(`H2 too many redirects (limit ${redirectLimit})`);
        const next = new URL(location, current);
        // Per fetch spec, 303 (and 301/302 on POST) downgrade to a bodyless GET.
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && currentMethod === "POST")) {
            currentMethod = "GET";
            currentBody = undefined;
            for (const k of Object.keys(merged)) {
                const name = k.toLowerCase();
                if (name === "content-type" || name === "content-length")
                    delete merged[k];
            }
        }
        current = next;
        if (current.protocol !== "https:")
            throw new Error("H2 redirect left https:");
    }
}
//# sourceMappingURL=h2client.js.map