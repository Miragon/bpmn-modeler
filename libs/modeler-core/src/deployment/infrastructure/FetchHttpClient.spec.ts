import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpTransportError } from "../../shared/domain/errors";
import { HttpResponse } from "../domain/ports";
import { FetchHttpClient } from "./FetchHttpClient";

type FetchHttpClientCall = (client: FetchHttpClient, url: string) => Promise<HttpResponse>;

const METHODS: [string, FetchHttpClientCall][] = [
    ["getText", (client, url) => client.getText(url)],
    ["getJson", (client, url) => client.getJson(url)],
    ["postJson", (client, url) => client.postJson(url, { name: "process" })],
    ["postForm", (client, url) => client.postForm(url, "grant_type=client_credentials")],
    ["postMultipart", (client, url) => client.postMultipart(url, Buffer.from("--b\r\n--b--"), "b")],
];

/** `ErrorOptions` is not in this lib target, so the cause is attached directly. */
function fetchFailure(message: string, cause: unknown): TypeError {
    return Object.assign(new TypeError(message), { cause });
}

/** Bun (the IntelliJ bridge) sets the code on the error itself and echoes the URL as `path`. */
function bunFetchFailure(message: string, code: string, path: string): Error {
    return Object.assign(new Error(message), { code, path });
}

function stubFetch(implementation: (url: string, init: RequestInit) => Promise<Response>) {
    const fetchStub = vi.fn(implementation);
    vi.stubGlobal("fetch", fetchStub);
    return fetchStub;
}

async function transportErrorOf(request: Promise<unknown>): Promise<HttpTransportError> {
    const error = await request.then(
        () => {
            throw new Error("expected the request to fail");
        },
        (rejection: unknown) => rejection,
    );
    expect(error).toBeInstanceOf(HttpTransportError);
    return error as HttpTransportError;
}

afterEach(() => vi.unstubAllGlobals());

describe("FetchHttpClient", () => {
    describe("when fetch rejects", () => {
        it.each([
            {
                failure: "a URL with credentials",
                url: "https://user:s3cret@engine.example/engine-rest/deployment/create",
                rejection: new TypeError(
                    "Request cannot be constructed from a URL that includes credentials: https://user:s3cret@engine.example/engine-rest/deployment/create",
                ),
                host: "engine.example",
                reason: "the URL must not contain credentials; use the authentication fields",
                secrets: ["s3cret", "user:", "/engine-rest"],
            },
            {
                failure: "an unparseable URL",
                url: "https://engine.example:99999/x?apikey=SECRET",
                rejection: new TypeError(
                    "Failed to parse URL from https://engine.example:99999/x?apikey=SECRET",
                ),
                host: "unknown-host",
                reason: "invalid URL",
                secrets: ["SECRET", "apikey", "?", "99999"],
            },
            {
                failure: "an invalid URL",
                url: "not a url ?token=SECRET",
                rejection: new TypeError("Invalid URL: not a url ?token=SECRET"),
                host: "unknown-host",
                reason: "invalid URL",
                secrets: ["SECRET", "token", "?"],
            },
            {
                failure: "a refused connection",
                url: "https://engine.example:8443/engine-rest/deployment/create?apikey=SECRET",
                rejection: fetchFailure(
                    "fetch failed",
                    Object.assign(
                        new Error(
                            "connect ECONNREFUSED https://engine.example:8443/engine-rest/deployment/create?apikey=SECRET",
                        ),
                        { code: "ECONNREFUSED" },
                    ),
                ),
                host: "engine.example:8443",
                reason: "ECONNREFUSED",
                secrets: ["SECRET", "apikey", "?", "/engine-rest"],
            },
            {
                failure: "a refused connection under Bun",
                url: "https://engine.example:8443/engine-rest/deployment/create?apikey=SECRET",
                rejection: bunFetchFailure(
                    "Unable to connect. Is the computer able to access the url?",
                    "ConnectionRefused",
                    "https://engine.example:8443/engine-rest/deployment/create?apikey=SECRET",
                ),
                host: "engine.example:8443",
                reason: "ConnectionRefused",
                secrets: ["SECRET", "apikey", "?", "/engine-rest", "access the url"],
            },
            {
                failure: "a self-signed certificate under Bun",
                url: "https://user:s3cret@engine.example/engine-rest?apikey=SECRET",
                rejection: bunFetchFailure(
                    "self signed certificate",
                    "DEPTH_ZERO_SELF_SIGNED_CERT",
                    "https://user:s3cret@engine.example/engine-rest?apikey=SECRET",
                ),
                host: "engine.example",
                reason: "DEPTH_ZERO_SELF_SIGNED_CERT",
                secrets: ["SECRET", "s3cret", "user:", "?", "/engine-rest", "self signed"],
            },
            {
                failure: "an invalid URL under Bun",
                url: "https://engine.example:99999/x?apikey=SECRET",
                rejection: new TypeError("fetch() URL is invalid"),
                host: "unknown-host",
                reason: "invalid URL",
                secrets: ["SECRET", "apikey", "?", "99999", "fetch()"],
            },
            {
                failure: "an unrecognised failure",
                url: "https://engine.example/engine-rest?apikey=SECRET",
                rejection: new TypeError(
                    "fetch failed for https://engine.example/engine-rest?apikey=SECRET",
                ),
                host: "engine.example",
                reason: "network error",
                secrets: ["SECRET", "apikey", "?", "/engine-rest"],
            },
            {
                failure: "a non-Error rejection",
                url: "https://engine.example/engine-rest?apikey=SECRET",
                rejection: "https://engine.example/engine-rest?apikey=SECRET",
                host: "engine.example",
                reason: "network error",
                secrets: ["SECRET", "apikey", "?", "/engine-rest"],
            },
        ])(
            "reports $failure by host and reason only",
            async ({ url, rejection, host, reason, secrets }) => {
                stubFetch(() => Promise.reject(rejection));

                const error = await transportErrorOf(new FetchHttpClient().getText(url));

                expect(error).toMatchObject({ host, reason });
                expect(error.message).toBe(`Request to ${host} failed: ${reason}`);
                for (const secret of secrets) {
                    expect(error.message).not.toContain(secret);
                }
            },
        );

        it("prefers a code on the error over the code of its cause", async () => {
            stubFetch(() =>
                Promise.reject(
                    Object.assign(fetchFailure("fetch failed", { code: "ECONNREFUSED" }), {
                        code: "ConnectionRefused",
                    }),
                ),
            );

            const error = await transportErrorOf(
                new FetchHttpClient().getText("https://engine.example/rest?apikey=SECRET"),
            );

            expect(error).toMatchObject({ host: "engine.example", reason: "ConnectionRefused" });
            expect(error.message).toBe("Request to engine.example failed: ConnectionRefused");
        });

        it("falls back to the message when the cause code is not a string", async () => {
            stubFetch(() => Promise.reject(fetchFailure("Invalid URL", { code: 42 })));

            const error = await transportErrorOf(
                new FetchHttpClient().getText("https://engine.example/rest"),
            );

            expect(error).toMatchObject({ host: "engine.example", reason: "invalid URL" });
        });

        it.each(METHODS)("%s wraps the rejection in HttpTransportError", async (_method, call) => {
            stubFetch(() => Promise.reject(fetchFailure("fetch failed", { code: "ECONNREFUSED" })));

            const error = await transportErrorOf(
                call(new FetchHttpClient(), "https://engine.example/rest?apikey=SECRET"),
            );

            expect(error).toMatchObject({ host: "engine.example", reason: "ECONNREFUSED" });
            expect(error.message).not.toContain("SECRET");
        });
    });

    describe("when fetch responds", () => {
        it.each(METHODS)("%s returns the status and body unchanged", async (_method, call) => {
            const fetchStub = stubFetch(() =>
                Promise.resolve(new Response('{"id":"deployment-1"}', { status: 201 })),
            );

            const response = await call(new FetchHttpClient(), "https://engine.example/rest");

            expect(response).toEqual({ status: 201, body: '{"id":"deployment-1"}' });
            expect(fetchStub).toHaveBeenCalledExactlyOnceWith(
                "https://engine.example/rest",
                expect.any(Object),
            );
        });

        it("passes an error status through instead of throwing", async () => {
            stubFetch(() => Promise.resolve(new Response("Unauthorized", { status: 401 })));

            const response = await new FetchHttpClient().postJson(
                "https://engine.example/rest",
                {},
            );

            expect(response).toEqual({ status: 401, body: "Unauthorized" });
        });

        it("sends the request as built, merging caller headers over the defaults", async () => {
            const fetchStub = stubFetch(() => Promise.resolve(new Response("{}")));

            await new FetchHttpClient().postJson(
                "https://engine.example/rest",
                { name: "process" },
                { "Authorization": "Bearer token", "Content-Type": "application/vnd+json" },
            );

            expect(fetchStub).toHaveBeenCalledWith("https://engine.example/rest", {
                method: "POST",
                headers: {
                    "Content-Type": "application/vnd+json",
                    "Authorization": "Bearer token",
                },
                body: '{"name":"process"}',
            });
        });
    });
});
