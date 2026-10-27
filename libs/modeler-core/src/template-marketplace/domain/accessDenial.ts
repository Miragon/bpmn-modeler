import { RepositoryAccessError } from "./ports";

/**
 * How an auth-shaped refusal reads to the user. The wording turns on whether
 * the refused request carried a token, and never names the token itself.
 */
export class AccessDenial {
    private constructor(
        private readonly error: RepositoryAccessError,
        private readonly tokenTried: boolean,
    ) {}

    static of(error: RepositoryAccessError, { tokenTried }: { tokenTried: boolean }): AccessDenial {
        return new AccessDenial(error, tokenTried);
    }

    promptReason(): string {
        const { host, status, resource, rateLimited } = this.error;
        if (rateLimited && !this.tokenTried) {
            return `Hit ${host}'s rate limit for ${resource}. A personal access token raises the limit.`;
        }
        if (this.tokenTried) {
            return `The stored token for ${host} was rejected (HTTP ${status}) for ${resource}. Enter a new token.`;
        }
        return `${host} denied access to ${resource} (HTTP ${status}); it may be private. Enter a personal access token.`;
    }

    /** Replaces the raw error once no token got through: for a private repo it would read "HTTP 404". */
    failureMessage(): string {
        const { host, status, resource, rateLimited } = this.error;
        if (rateLimited) {
            return `${host} rate limit exceeded for ${resource} — try again later or provide a personal access token.`;
        }
        if (this.tokenTried) {
            return `The token for ${host} can't access ${resource} (HTTP ${status}).`;
        }
        return `${resource} on ${host} requires a personal access token (none provided).`;
    }
}
