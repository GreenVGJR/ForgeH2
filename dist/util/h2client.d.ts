import http2 from "http2";
import { Headers } from "undici";
export interface H2Result {
    status: number;
    headers: Headers;
    body: Buffer;
    protocol: string;
}
export declare function getSession(origin: string): http2.ClientHttp2Session;
export declare function closeAllSessions(): void;
/**
 * Decompresses a body according to its `content-encoding`, mirroring what
 * undici's `fetch` does transparently. raw `node:http2` gives us raw bytes.
 */
export declare function decompress(body: Buffer, encoding: string | null): Promise<Buffer>;
/**
 * HTTP/2 request with automatic redirect following (default: 5 hops, matching
 * undici/`fetch`) and transparent body decompression.
 *
 * @param redirectLimit max redirects to follow before erroring. `0` disables.
 */
export declare function requestViaH2(urlStr: string, method: string, headers: Record<string, string>, body?: Buffer, timeoutMs?: number, redirectLimit?: number): Promise<H2Result>;
