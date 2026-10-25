import { randomFillSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getNonce } from "./helpers";

afterEach(() => vi.restoreAllMocks());

function randomSource(nextByte: () => number) {
    return vi.fn((bytes: Uint8Array) => {
        bytes.forEach((_, index) => (bytes[index] = nextByte()));
    });
}

describe("getNonce", () => {
    it("is 32 alphanumeric characters, safe to embed in a CSP nonce-source", () => {
        expect(getNonce(randomFillSync)).toMatch(/^[A-Za-z0-9]{32}$/);
    });

    it("differs between calls", () => {
        const nonces = new Set(Array.from({ length: 20 }, () => getNonce(randomFillSync)));

        expect(nonces.size).toBe(20);
    });

    it("draws its characters from the injected random source, not Math.random", () => {
        const mathRandom = vi.spyOn(Math, "random");
        const fillRandomBytes = randomSource(() => 0);

        expect(getNonce(fillRandomBytes)).toBe("A".repeat(32));
        expect(fillRandomBytes).toHaveBeenCalled();
        expect(mathRandom).not.toHaveBeenCalled();
    });

    it("maps the highest accepted byte to the last alphabet character", () => {
        expect(getNonce(randomSource(() => 247))).toBe("9".repeat(32));
    });

    it("discards bytes that would over-weight the start of the alphabet, drawing more as needed", () => {
        const biasedBytes = Array.from({ length: 200 }, (_, index) => 248 + (index % 8));
        let drawCount = 0;

        expect(getNonce(randomSource(() => biasedBytes[drawCount++] ?? 61))).toBe("9".repeat(32));
    });
});
