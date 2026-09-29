"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSession = getSession;
exports.closeAllSessions = closeAllSessions;
exports.requestViaH2 = requestViaH2;
const http2_1 = __importDefault(require("http2"));
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
function requestViaH2(urlStr, method, headers, body, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        let url;
        try {
            url = new URL(urlStr);
        }
        catch (err) {
            reject(err);
            return;
        }
        if (url.protocol !== "https:") {
            reject(new Error("H2 requires https:"));
            return;
        }
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
            resolve({
                status,
                headers: out,
                body: Buffer.concat(chunks),
                protocol: socket?.alpnProtocol || "h2",
            });
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
//# sourceMappingURL=h2client.js.map