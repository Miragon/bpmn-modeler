import { HttpResponse } from "../domain/http";

/**
 * Minimal HTTP client contract used by outbound adapters.
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
