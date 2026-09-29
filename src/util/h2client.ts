import http2 from "http2";
import zlib from "zlib";
import { Headers } from "undici";

export interface H2Result {
  status: number;
  headers: Headers;
  body: Buffer;
  protocol: string;
}

const sessions = new Map<string, http2.ClientHttp2Session>();

function originOf(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

export function getSession(origin: string): http2.ClientHttp2Session {
  const existing = sessions.get(origin);
  if (existing && !existing.destroyed && !existing.closed) return existing;
  if (existing) sessions.delete(origin);

  const session = http2.connect(origin);
  sessions.set(origin, session);
  session.on("error", () => {
    if (sessions.get(origin) === session) sessions.delete(origin);
    try {
      session.destroy();
    } catch {
      /* noop */
    }
  });
  session.on("close", () => {
    if (sessions.get(origin) === session) sessions.delete(origin);
  });
  return session;
}

export function closeAllSessions(): void {
  for (const [, session] of sessions) {
    try {
      session.close();
    } catch {
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
const DEFAULT_HEADERS: Record<string, string> = {
  accept: "*/*",
  "accept-encoding": `br, gzip, deflate${
    typeof zlib.zstdDecompress === "function" ? ", zstd" : ""
  }`,
  "accept-language": "*",
  "sec-fetch-mode": "cors",
  "user-agent": "undici",
};

/** Fills in missing defaults. Headers the caller set always win. */
export function withDefaultHeaders(
  headers: Record<string, string>,
  removed?: Set<string>
): Record<string, string> {
  const out: Record<string, string> = {};
  const given = new Set(Object.keys(headers).map((k) => k.toLowerCase()));
  for (const [k, v] of Object.entries(DEFAULT_HEADERS)) {
    if (!given.has(k) && !removed?.has(k)) out[k] = v;
  }
  return Object.assign(out, headers);
}

/** Decompresses per `content-encoding`, which fetch does transparently. */
export function decompress(body: Buffer, encoding: string | null): Promise<Buffer> {
  const enc = (encoding ?? "").trim().toLowerCase();
  if (!body.length || !enc || enc === "identity") return Promise.resolve(body);

  return new Promise((resolve, reject) => {
    const done = (err: Error | null, out: Buffer) => (err ? reject(err) : resolve(out));
    if (enc === "gzip" || enc === "x-gzip") zlib.gunzip(body, done);
    else if (enc === "deflate") zlib.inflate(body, done);
    else if (enc === "br") zlib.brotliDecompress(body, done);
    else if (enc === "zstd" && typeof zlib.zstdDecompress === "function")
      zlib.zstdDecompress(body, done);
    else resolve(body);
  });
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

/** Single H2 round-trip, no redirect handling. */
function requestOnce(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: Buffer | undefined,
  timeoutMs: number
): Promise<H2Result> {
  return new Promise((resolve, reject) => {
    let session: http2.ClientHttp2Session;
    try {
      session = getSession(originOf(url));
    } catch (err) {
      reject(err);
      return;
    }

    const outHeaders: http2.OutgoingHttpHeaders = {
      ":method": method.toUpperCase(),
      ":path": `${url.pathname}${url.search}`,
      ":scheme": "https",
      ":authority": url.host,
    };

    for (const [k, v] of Object.entries(headers)) {
      const name = k.toLowerCase();
      if (FORBIDDEN.has(name) || name.startsWith(":")) continue;
      outHeaders[name] = v;
    }

    let req: http2.ClientHttp2Stream;
    try {
      req = session.request(outHeaders);
    } catch (err) {
      reject(err);
      return;
    }

    const timer = setTimeout(() => {
      try {
        req.close(http2.constants.NGHTTP2_CANCEL);
      } catch {
        /* noop */
      }
      reject(new Error("H2 request timed out"));
    }, timeoutMs);

    let status = 0;
    const rawHeaders: Record<string, string | string[]> = {};
    const chunks: Buffer[] = [];

    req.on("response", (headers) => {
      for (const [k, v] of Object.entries(headers)) {
        if (k === ":status") {
          status = Array.isArray(v) ? Number(v[0]) : Number(v);
          continue;
        }
        if (v === undefined) continue;
        rawHeaders[k] = v as string | string[];
      }
    });

    req.on("data", (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on("end", () => {
      clearTimeout(timer);
      const out = new Headers();
      for (const [k, v] of Object.entries(rawHeaders)) {
        if (Array.isArray(v)) {
          for (const item of v) out.append(k, item);
        } else {
          out.append(k, v);
        }
      }
      const socket = session.socket as unknown as { alpnProtocol?: string };
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
      if (body && body.length) req.write(body);
      req.end();
    } catch (err) {
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
export async function requestViaH2(
  urlStr: string,
  method: string,
  headers: Record<string, string>,
  body?: Buffer,
  timeoutMs = 15000,
  redirectLimit = 5,
  removed?: Set<string>
): Promise<H2Result> {
  const url = new URL(urlStr);
  if (url.protocol !== "https:") throw new Error("H2 requires https:");

  const merged = withDefaultHeaders(headers, removed);
  let current = url;
  let currentMethod = method.toUpperCase();
  let currentBody = body;

  for (let hop = 0; ; hop++) {
    const res = await requestOnce(current, currentMethod, merged, currentBody, timeoutMs);

    if (!REDIRECT_STATUS.has(res.status)) return res;

    const location = res.headers.get("location");
    if (!location) return res;

    if (redirectLimit <= 0 || hop >= redirectLimit)
      throw new Error(`H2 too many redirects (limit ${redirectLimit})`);

    const next = new URL(location, current);

    // Per fetch spec, 303 (and 301/302 on POST) downgrade to a bodyless GET.
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && currentMethod === "POST")) {
      currentMethod = "GET";
      currentBody = undefined;
      for (const k of Object.keys(merged)) {
        const name = k.toLowerCase();
        if (name === "content-type" || name === "content-length") delete merged[k];
      }
    }

    current = next;
    if (current.protocol !== "https:") throw new Error("H2 redirect left https:");
  }
}
