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
export declare function requestViaH2(urlStr: string, method: string, headers: Record<string, string>, body?: Buffer, timeoutMs?: number): Promise<H2Result>;
