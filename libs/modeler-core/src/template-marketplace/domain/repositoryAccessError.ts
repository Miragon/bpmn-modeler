/**
 * Thrown by a {@link RepositorySource} when the host denies access in an
 * auth-shaped way (401/403/404, plus 429 for GitLab's rate limit). GitHub and
 * GitLab both return 404 for a private repo the caller cannot see, so 404 is
 * treated as "may need a token" too. The service catches this to drive a
 * prompt-and-retry instead of string-parsing messages.
 *
 * `rateLimited` only changes the wording, not whether we prompt (a token
 * remains a valid remedy either way).
 *
 * Invariant: the message must never contain the token.
 */
export class RepositoryAccessError extends Error {
    constructor(
        readonly host: string,
        readonly status: number,
        readonly resource: string,
        readonly rateLimited: boolean,
    ) {
        super(`${host} denied access to ${resource} (HTTP ${status})`);
        this.name = "RepositoryAccessError";
    }
}
