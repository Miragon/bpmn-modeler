import * as nodeCrypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createWebviewNonce } from "./webviewNonce";

vi.mock("node:crypto", async (importOriginal) => {
    const original = await importOriginal<typeof import("node:crypto")>();
    return { ...original, randomFillSync: vi.fn(original.randomFillSync) };
});

afterEach(() => vi.clearAllMocks());

describe("createWebviewNonce", () => {
    it("draws a CSP-safe nonce from Node's CSPRNG", () => {
        expect(createWebviewNonce()).toMatch(/^[A-Za-z0-9]{32}$/);
        expect(nodeCrypto.randomFillSync).toHaveBeenCalled();
    });

    it("works without a global Web Crypto", () => {
        vi.stubGlobal("crypto", undefined);
        try {
            expect(createWebviewNonce()).toMatch(/^[A-Za-z0-9]{32}$/);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
