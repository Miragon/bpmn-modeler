const NONCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const NONCE_LENGTH = 32;
// Bytes at or above this bound would map to the alphabet's start more often than to its end.
const UNBIASED_BYTE_LIMIT = 256 - (256 % NONCE_ALPHABET.length);

/** Fills the given buffer with cryptographically secure random bytes. */
export type FillRandomBytes = (bytes: Uint8Array) => void;

export function getNonce(fillRandomBytes: FillRandomBytes): string {
    const randomBytes = new Uint8Array(NONCE_LENGTH * 2);
    let nonce = "";
    while (nonce.length < NONCE_LENGTH) {
        fillRandomBytes(randomBytes);
        for (const randomByte of randomBytes) {
            if (randomByte < UNBIASED_BYTE_LIMIT && nonce.length < NONCE_LENGTH) {
                nonce += NONCE_ALPHABET[randomByte % NONCE_ALPHABET.length];
            }
        }
    }
    return nonce;
}
