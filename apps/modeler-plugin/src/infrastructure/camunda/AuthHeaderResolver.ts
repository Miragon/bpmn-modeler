import { AuthConfig, OAuth2Auth } from "../../domain/deployment";
import { TokenFetchError } from "../../domain/errors";
import { HttpClient } from "../../domain/ports";

/**
 * Resolves an {@link AuthConfig} into concrete HTTP headers.
 *
 * Keeps the auth concern out of the REST client itself, and makes it
 * independently testable with a mocked {@link HttpClient}.
 */
export class AuthHeaderResolver {
    /**
     * @param httpClient HTTP client used to fetch OAuth2 access tokens.
     */
    constructor(private readonly httpClient: HttpClient) {}

    /**
     * Converts an {@link AuthConfig} into the corresponding HTTP headers.
     *
     * - `NoAuth`   → empty object
     * - `BasicAuth` → `{ Authorization: "Basic <base64>" }`
     * - `OAuth2Auth` → fetches an access token, returns `{ Authorization: "Bearer <token>" }`
     *
     * @param auth Authentication configuration to resolve.
     * @returns A record of HTTP headers to merge into the outgoing request.
     * @throws {TokenFetchError} If the OAuth2 token fetch fails.
     */
    async resolve(auth: AuthConfig): Promise<Record<string, string>> {
        switch (auth.type) {
            case "none":
                return {};

            case "basic": {
                const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString(
                    "base64",
                );
                return { Authorization: `Basic ${credentials}` };
            }

            case "oauth2": {
                const accessToken = await this.fetchAccessToken(auth);
                return { Authorization: `Bearer ${accessToken}` };
            }
        }
    }

    /**
     * Fetches an OAuth2 access token using the Client Credentials grant.
     *
     * @param auth The OAuth2 authentication configuration.
     * @returns The `access_token` string from the token endpoint response.
     * @throws {TokenFetchError} If the request fails, returns non-2xx,
     *   invalid JSON, or a response missing `access_token`.
     */
    private async fetchAccessToken(auth: OAuth2Auth): Promise<string> {
        const params = new URLSearchParams({
            grant_type: "client_credentials",
            client_id: auth.clientId,
            client_secret: auth.clientSecret,
        });

        if (auth.audience) {
            params.set("audience", auth.audience);
        }

        let response;
        try {
            response = await this.httpClient.postForm(auth.tokenEndpoint, params.toString());
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new TokenFetchError(message);
        }

        if (response.status < 200 || response.status >= 300) {
            throw new TokenFetchError(`HTTP ${response.status}: ${response.body}`);
        }

        let json: Record<string, unknown>;
        try {
            json = JSON.parse(response.body);
        } catch {
            throw new TokenFetchError(`Invalid JSON response: ${response.body}`);
        }

        if (typeof json.access_token !== "string") {
            throw new TokenFetchError("Response does not contain an access_token.");
        }

        return json.access_token;
    }
}
