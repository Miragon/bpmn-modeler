import { Mocked, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthHeaderResolver } from "./AuthHeaderResolver";
import { BasicAuth, NoAuth, OAuth2Auth } from "../../domain/deployment";
import { TokenFetchError } from "../../../shared/domain/errors";
import { HttpClient, HttpResponse } from "../../domain/ports";

function mockHttpClient(): Mocked<HttpClient> {
    return {
        getText: vi.fn(),
        getJson: vi.fn(),
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
        await expect(resolver.resolve(auth)).rejects.toThrow(
            "Failed to fetch OAuth2 access token: the token endpoint did not return JSON.",
        );
    });

    // ── Token endpoint error bodies ─────────────────────────────────────

    it("masks the client credentials a token endpoint echoes in its error description", async () => {
        httpClient.postForm.mockResolvedValue({
            status: 401,
            body: JSON.stringify({
                error: "invalid_client",
                error_description:
                    "Client authentication failed for client_id=svc-modeler&client_secret=Zx9-secret-value",
            }),
        });

        const auth = new OAuth2Auth(
            "svc-modeler",
            "Zx9-secret-value",
            "http://idp.local/token",
            "",
        );

        const error = await resolver.resolve(auth).catch((rejection: unknown) => rejection);

        expect(error).toBeInstanceOf(TokenFetchError);
        expect((error as Error).message).toContain("HTTP 401: Client authentication failed");
        expect((error as Error).message).not.toContain("Zx9-secret-value");
        expect((error as Error).message).not.toContain("svc-modeler");
    });

    it("masks a client secret the token endpoint echoes back form-encoded", async () => {
        // Form encoding escapes the "~" common in Entra ID secrets; encodeURIComponent keeps it.
        const clientSecret = "Ab8Q~xY.z_9-Secret";
        httpClient.postForm.mockImplementation(async (_url, formBody) => ({
            status: 400,
            body: `Malformed token request: ${formBody}`,
        }));

        const auth = new OAuth2Auth("svc-modeler", clientSecret, "http://idp.local/token", "");

        const error = await resolver.resolve(auth).catch((rejection: unknown) => rejection);

        expect(error).toBeInstanceOf(TokenFetchError);
        expect((error as Error).message).toContain("HTTP 400: Malformed token request:");
        expect((error as Error).message).not.toContain("Ab8Q");
    });

    it("reports only the status for an HTML error page from the token endpoint", async () => {
        httpClient.postForm.mockResolvedValue({
            status: 502,
            body: "<html><body><h1>502 Bad Gateway</h1></body></html>",
        });

        const auth = new OAuth2Auth("cid", "csec", "http://idp.local/token", "");

        await expect(resolver.resolve(auth)).rejects.toThrow(
            "Failed to fetch OAuth2 access token: HTTP 502.",
        );
    });

    it("never echoes a successful body that is not JSON, since it may carry the token", async () => {
        const accessToken = "gho_16C7e42F292c6912E7710c838347Ae178B4a";
        httpClient.postForm.mockResolvedValue({
            status: 200,
            body: `access_token=${accessToken}&scope=repo&token_type=bearer`,
        });

        const auth = new OAuth2Auth("cid", "csec", "http://idp.local/token", "");

        const error = await resolver.resolve(auth).catch((rejection: unknown) => rejection);

        expect(error).toBeInstanceOf(TokenFetchError);
        expect((error as Error).message).not.toContain(accessToken);
        expect((error as Error).message).not.toContain("access_token=");
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
