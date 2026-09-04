// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { isTextEditingSurface } from "./textEditingSurface";

describe("isTextEditingSurface", () => {
    it("returns true for <input>", () => {
        expect(isTextEditingSurface(document.createElement("input"))).toBe(true);
    });

    it("returns true for <textarea>", () => {
        expect(isTextEditingSurface(document.createElement("textarea"))).toBe(true);
    });

    it("returns true for contenteditable element", () => {
        const div = document.createElement("div");
        div.contentEditable = "true";
        expect(isTextEditingSurface(div)).toBe(true);
    });

    it("returns false for a plain <div>", () => {
        expect(isTextEditingSurface(document.createElement("div"))).toBe(false);
    });

    it("returns false for null", () => {
        expect(isTextEditingSurface(null)).toBe(false);
    });

    it("returns false for contenteditable=inherit", () => {
        const div = document.createElement("div");
        div.contentEditable = "inherit";
        expect(isTextEditingSurface(div)).toBe(false);
    });
});
