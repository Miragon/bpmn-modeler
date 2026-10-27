/**
 * Immutable representation of an HTTP response.
 */
export interface HttpResponse {
    readonly status: number;
    readonly body: string;
}

/**
 * Minimal HTTP client contract used by infrastructure adapters.
 *
 * Each method maps to a different content-type strategy; implementations
 * handle serialisation, transport, and response buffering.
 */
export interface HttpClient {
    getText(url: string, headers?: Record<string, string>): Promise<HttpResponse>;

    /**
     * Body is returned as raw text so the caller owns parsing — the marketplace
     * adapters need to read GitHub error bodies on non-2xx too.
     */
    getJson(url: string, headers?: Record<string, string>): Promise<HttpResponse>;

    /**
     * Sends a POST request with a JSON body.
     *
     * @param url Full URL to POST to.
     * @param body JSON-serialisable payload.
     * @param headers Optional extra headers to merge into the request.
     * @returns The HTTP status code and raw response body text.
     */
    postJson(
        url: string,
        body: Record<string, unknown>,
        headers?: Record<string, string>,
    ): Promise<HttpResponse>;

    /**
     * Sends a POST request with a URL-encoded form body.
     *
     * @param url Full URL to POST to.
     * @param body URL-encoded form string.
     * @param headers Optional extra headers to merge into the request.
     * @returns The HTTP status code and raw response body text.
     */
    postForm(url: string, body: string, headers?: Record<string, string>): Promise<HttpResponse>;

    /**
     * Sends a POST request with a multipart/form-data body.
     *
     * @param url Full URL to POST to.
     * @param body Pre-assembled multipart body buffer.
     * @param boundary The multipart boundary string.
     * @param headers Optional extra headers to merge into the request.
     * @returns The HTTP status code and raw response body text.
     */
    postMultipart(
        url: string,
        body: Buffer,
        boundary: string,
        headers?: Record<string, string>,
    ): Promise<HttpResponse>;
}

/**
 * A request that never got a response. The URL is deliberately left out of the
 * message: it may embed `.env` values, and fetch's own errors echo it verbatim.
 */
export class HttpTransportError extends Error {
    constructor(
        readonly host: string,
        readonly reason: string,
    ) {
        super(`Request to ${host} failed: ${reason}`);
        this.name = "HttpTransportError";
    }
}

export function hostOf(url: string): string | undefined {
    try {
        return new URL(url).host || undefined;
    } catch {
        return undefined;
    }
}

/**
 * Host[:port] for breadcrumbs — never the path, query, or userinfo. `URL.host`
 * excludes any `user:pass@` prefix, so a credentialled URL can't leak into logs.
 */
export function loggableHost(url: string): string {
    return hostOf(url) ?? "unknown-host";
}
