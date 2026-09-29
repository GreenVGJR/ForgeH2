import http2 from "http2";
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

export function requestViaH2(
  urlStr: string,
  method: string,
  headers: Record<string, string>,
  body?: Buffer,
  timeoutMs = 15000
): Promise<H2Result> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(urlStr);
    } catch (err) {
      reject(err);
      return;
    }

    if (url.protocol !== "https:") {
      reject(new Error("H2 requires https:"));
      return;
    }

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
      if (body && body.length) req.write(body);
      req.end();
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}
