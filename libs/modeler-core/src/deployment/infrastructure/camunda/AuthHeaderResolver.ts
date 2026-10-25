import { AuthConfig, OAuth2Auth } from "../../domain/deployment";
import { TokenFetchError } from "../../../shared/domain/errors";
import { HttpClient } from "../../domain/ports";
import { SecretRedactor } from "../../domain/secretRedactor";
import { engineErrorDetail, requestRedactor } from "./engineError";

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
     * OAuth2 needs an async token fetch and is therefore handled here;
     * the pure schemes (`NoAuth`, `BasicAuth`) own their own header
     * formatting via `toHeaders()` and are delegated to.
     *
     * @param auth Authentication configuration to resolve.
     * @param requestSecrets What a token endpoint's error must not echo back.
     * @returns A record of HTTP headers to merge into the outgoing request.
     * @throws {TokenFetchError} If the OAuth2 token fetch fails.
     */
    async resolve(
        auth: AuthConfig,
        requestSecrets: SecretRedactor = auth.redactor(),
    ): Promise<Record<string, string>> {
        if (auth.type === "oauth2") {
            const accessToken = await this.fetchAccessToken(auth, requestSecrets);
            return { Authorization: `Bearer ${accessToken}` };
        }
        return auth.toHeaders();
    }

    /**
     * Fetches an OAuth2 access token using the Client Credentials grant.
     *
     * @param auth The OAuth2 authentication configuration.
     * @returns The `access_token` string from the token endpoint response.
     * @throws {TokenFetchError} If the request fails, returns non-2xx,
     *   invalid JSON, or a response missing `access_token`.
     */
    private async fetchAccessToken(
        auth: OAuth2Auth,
        requestSecrets: SecretRedactor,
    ): Promise<string> {
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
            const detail = engineErrorDetail(
                response.body,
                requestRedactor(requestSecrets, {}, auth.tokenEndpoint),
            );
            throw new TokenFetchError(
                detail === undefined
                    ? `HTTP ${response.status}.`
                    : `HTTP ${response.status}: ${detail}`,
            );
        }

        // A successful body may carry the token in another format, so it is never echoed.
        let json: Record<string, unknown>;
        try {
            json = JSON.parse(response.body);
        } catch {
            throw new TokenFetchError("the token endpoint did not return JSON.");
        }

        if (typeof json.access_token !== "string") {
            throw new TokenFetchError("Response does not contain an access_token.");
        }

        return json.access_token;
    }
}
