import { HttpTransportError } from "../../shared/domain/errors";
import { HttpClient, HttpResponse } from "../domain/ports";
import { loggableHost } from "../domain/urlTemplate";

/**
 * {@link HttpClient} implementation backed by `globalThis.fetch`.
 *
 * Available in Node 18+ (which VS Code 1.76+ ships with), so no
 * external dependencies are required.
 */
export class FetchHttpClient implements HttpClient {
    async getText(url: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
        const response = await send(url, { method: "GET", headers });
        return {
            status: response.status,
            body: await response.text(),
        };
    }

    async getJson(url: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
        const response = await send(url, {
            method: "GET",
            headers: {
                Accept: "application/json",
                ...headers,
            },
        });
        return {
            status: response.status,
            body: await response.text(),
        };
    }

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
        const response = await send(url, {
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
        const response = await send(url, {
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
        const response = await send(url, {
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

async function send(url: string, init: RequestInit): Promise<Response> {
    try {
        return await fetch(url, init);
    } catch (error) {
        throw new HttpTransportError(loggableHost(url), transportFailureReason(error));
    }
}

/**
 * Only a stable code or a fixed phrase — fetch's messages and causes can echo
 * the URL. Node nests the code under `cause`; Bun (the IntelliJ bridge) sets it
 * on the error itself.
 */
function transportFailureReason(error: unknown): string {
    const failure = error as { code?: unknown; cause?: { code?: unknown } } | undefined;
    const code = [failure?.code, failure?.cause?.code].find(
        (candidate) => typeof candidate === "string",
    );
    if (code !== undefined) {
        return code as string;
    }
    const message = error instanceof Error ? error.message : "";
    if (message.includes("includes credentials")) {
        return "the URL must not contain credentials; use the authentication fields";
    }
    if (/parse URL|Invalid URL|URL is invalid/.test(message)) {
        return "invalid URL";
    }
    return "network error";
}
