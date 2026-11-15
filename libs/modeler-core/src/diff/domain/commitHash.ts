// SHA-1 or, in a repository on the SHA-256 object format, SHA-256.
const FULL_COMMIT_HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

// The Git extension's default `git.commitShortHashLength`.
const SHORT_HASH_LENGTH = 7;

export function isFullCommitHash(text: string): boolean {
    return FULL_COMMIT_HASH.test(text);
}

/** A commit as the Git extension names it in its diff titles. */
export function shortCommitHash(hash: string): string {
    return hash.slice(0, SHORT_HASH_LENGTH);
}
