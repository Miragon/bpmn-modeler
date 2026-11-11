const DIGEST = /^[0-9a-f]{32,}$/i;

/** A content hash: it reads in a monospaced face, where each character keeps its column. */
export function isDigestValue(value: string): boolean {
    return DIGEST.test(value);
}
