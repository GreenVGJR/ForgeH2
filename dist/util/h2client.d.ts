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
/** Fills in missing defaults. Headers the caller set always win. */
export declare function withDefaultHeaders(headers: Record<string, string>, removed?: Set<string>): Record<string, string>;
/** Decompresses per `content-encoding`, which fetch does transparently. */
export declare function decompress(body: Buffer, encoding: string | null): Promise<Buffer>;
/**
 * HTTP/2 request with redirect following and transparent decompression.
 *
 * @param redirectLimit max redirects to follow. `0` disables.
 */
export declare function requestViaH2(urlStr: string, method: string, headers: Record<string, string>, body?: Buffer, timeoutMs?: number, redirectLimit?: number, removed?: Set<string>): Promise<H2Result>;
