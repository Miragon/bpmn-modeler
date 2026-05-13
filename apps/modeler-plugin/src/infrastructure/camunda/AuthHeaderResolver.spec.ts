import { Mocked, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthHeaderResolver } from "./AuthHeaderResolver";
import { BasicAuth, NoAuth, OAuth2Auth } from "../../domain/deployment";
import { TokenFetchError } from "../../domain/errors";
import { HttpClient, HttpResponse } from "../../domain/ports";

function mockHttpClient(): Mocked<HttpClient> {
    return {
        postJson: vi.fn(),
        postForm: vi.fn(),
        postMultipart: vi.fn(),
    };
}

describe("AuthHeaderResolver", () => {
    let httpClient: Mocked<HttpClient>;
    let resolver: AuthHeaderResolver;

    beforeEach(() => {
        httpClient = mockHttpClient();
        resolver = new AuthHeaderResolver(httpClient);
    });

    // ── NoAuth ──────────────────────────────────────────────────────────

    it("should return empty headers for NoAuth", async () => {
        const result = await resolver.resolve(new NoAuth());

        expect(result).toEqual({});
        expect(httpClient.postForm).not.toHaveBeenCalled();
    });

    // ── BasicAuth ───────────────────────────────────────────────────────

    it("should return correct Base64-encoded Authorization header for BasicAuth", async () => {
        const result = await resolver.resolve(new BasicAuth("admin", "secret"));

        const expected = Buffer.from("admin:secret").toString("base64");
        expect(result).toEqual({ Authorization: `Basic ${expected}` });
    });

    it("should encode special characters correctly in BasicAuth", async () => {
        const result = await resolver.resolve(new BasicAuth("user:name", "p@ss:wörd"));

        const expected = Buffer.from("user:name:p@ss:wörd").toString("base64");
        expect(result).toEqual({ Authorization: `Basic ${expected}` });
    });

    // ── OAuth2 ──────────────────────────────────────────────────────────

    it("should fetch token and return Bearer header for OAuth2", async () => {
        const tokenResponse: HttpResponse = {
            status: 200,
            body: JSON.stringify({ access_token: "tok123" }),
        };
        httpClient.postForm.mockResolvedValue(tokenResponse);

        const auth = new OAuth2Auth("my-client", "my-secret", "http://idp.local/token", "");

        const result = await resolver.resolve(auth);

        expect(result).toEqual({ Authorization: "Bearer tok123" });
        expect(httpClient.postForm).toHaveBeenCalledTimes(1);

        // Verify the form body sent to the token endpoint
        const [url, body] = httpClient.postForm.mock.calls[0];
        expect(url).toBe("http://idp.local/token");
        const params = new URLSearchParams(body);
        expect(params.get("grant_type")).toBe("client_credentials");
        expect(params.get("client_id")).toBe("my-client");
        expect(params.get("client_secret")).toBe("my-secret");
    });

    it("should include audience parameter when provided", async () => {
        httpClient.postForm.mockResolvedValue({
            status: 200,
            body: JSON.stringify({ access_token: "tok" }),
        });

        const auth = new OAuth2Auth(
            "cid",
            "csec",
            "http://idp.local/token",
            "https://api.example.com",
        );

        await resolver.resolve(auth);

        const params = new URLSearchParams(httpClient.postForm.mock.calls[0][1]);
        expect(params.get("audience")).toBe("https://api.example.com");
    });

    it("should omit audience parameter when empty", async () => {
        httpClient.postForm.mockResolvedValue({
            status: 200,
            body: JSON.stringify({ access_token: "tok" }),
        });

        const auth = new OAuth2Auth("cid", "csec", "http://idp.local/token", "");

        await resolver.resolve(auth);

        const params = new URLSearchParams(httpClient.postForm.mock.calls[0][1]);
        expect(params.has("audience")).toBe(false);
    });

    it("should throw TokenFetchError on non-2xx response", async () => {
        httpClient.postForm.mockResolvedValue({
            status: 401,
            body: "Unauthorized",
        });

        const auth = new OAuth2Auth("cid", "csec", "http://idp.local/token", "");

        await expect(resolver.resolve(auth)).rejects.toThrow(TokenFetchError);
    });

    it("should throw TokenFetchError on invalid JSON response", async () => {
        httpClient.postForm.mockResolvedValue({
            status: 200,
            body: "not json",
        });

        const auth = new OAuth2Auth("cid", "csec", "http://idp.local/token", "");

        await expect(resolver.resolve(auth)).rejects.toThrow(TokenFetchError);
        await expect(resolver.resolve(auth)).rejects.toThrow(/Invalid JSON response/);
    });

    it("should throw TokenFetchError when access_token is missing", async () => {
        httpClient.postForm.mockResolvedValue({
            status: 200,
            body: JSON.stringify({ token_type: "bearer" }),
        });

        const auth = new OAuth2Auth("cid", "csec", "http://idp.local/token", "");

        await expect(resolver.resolve(auth)).rejects.toThrow(TokenFetchError);
        await expect(resolver.resolve(auth)).rejects.toThrow(/does not contain an access_token/);
    });
});
