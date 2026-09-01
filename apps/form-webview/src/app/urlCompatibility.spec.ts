import { describe, expect, it, vi } from "vitest";

import {
    ArraySortPrototype,
    ensureArrayToSorted,
    ensureUrlCanParse,
    URLConstructor,
} from "./urlCompatibility";

describe("ensureUrlCanParse", () => {
    it("installs the browser API missing from the VS Code 1.76 runtime", () => {
        const urlApi = class extends URL {} as URLConstructor;
        Object.defineProperty(urlApi, "canParse", { value: undefined, writable: true });

        ensureUrlCanParse(urlApi);

        expect(urlApi.canParse?.("https://example.com/document.pdf")).toBe(true);
        expect(urlApi.canParse?.("/document.pdf", "https://example.com")).toBe(true);
        expect(urlApi.canParse?.("not a URL")).toBe(false);
    });

    it("preserves a native implementation", () => {
        const urlApi = class extends URL {} as URLConstructor;
        const native = vi.fn(() => true);
        Object.defineProperty(urlApi, "canParse", { value: native, writable: true });

        ensureUrlCanParse(urlApi);

        expect(urlApi.canParse).toBe(native);
    });
});

describe("ensureArrayToSorted", () => {
    it("installs the array API missing from the VS Code 1.76 runtime", () => {
        const prototype: ArraySortPrototype = {};

        ensureArrayToSorted(prototype);

        expect(prototype.toSorted?.call([3, 1, 2], (a, b) => a - b)).toEqual([1, 2, 3]);
    });
});
