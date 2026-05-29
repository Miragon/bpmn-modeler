import { HttpClient, HttpResponse } from "../domain/ports";

/**
 * {@link HttpClient} implementation backed by `globalThis.fetch`.
 *
 * Available in Node 18+ (which VS Code 1.76+ ships with), so no
 * external dependencies are required.
 */
export class FetchHttpClient implements HttpClient {
    /**
     * Sends a POST request with a JSON body.
     *
     * @param url Full URL to POST to.
     * @param body JSON-serialisable payload.
     * @param headers Optional extra headers to merge into the request.
     * @returns The HTTP status code and raw response body text.
     */
    async postJson(
        url: string,
        body: Record<string, unknown>,
        headers: Record<string, string> = {},
    ): Promise<HttpResponse> {
        const bodyStr = JSON.stringify(body);
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...headers,
            },
            body: bodyStr,
        });

        return {
            status: response.status,
            body: await response.text(),
        };
    }

    /**
     * Sends a POST request with a URL-encoded form body.
     *
     * @param url Full URL to POST to.
     * @param body URL-encoded form string.
     * @param headers Optional extra headers to merge into the request.
     * @returns The HTTP status code and raw response body text.
     */
    async postForm(
        url: string,
        body: string,
        headers: Record<string, string> = {},
    ): Promise<HttpResponse> {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                ...headers,
            },
            body,
        });

        return {
            status: response.status,
            body: await response.text(),
        };
    }

    /**
     * Sends a POST request with a multipart/form-data body.
     *
     * @param url Full URL to POST to.
     * @param body Pre-assembled multipart body buffer.
     * @param boundary The multipart boundary string.
     * @param headers Optional extra headers to merge into the request.
     * @returns The HTTP status code and raw response body text.
     */
    async postMultipart(
        url: string,
        body: Buffer,
        boundary: string,
        headers: Record<string, string> = {},
    ): Promise<HttpResponse> {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                ...headers,
            },
            body: body as unknown as BodyInit,
        });

        return {
            status: response.status,
            body: await response.text(),
        };
    }
}
