import { describe, expect, it } from "vitest";

import { README_MAX_LENGTH, readmeOf } from "./addOnReadme";

describe("readmeOf", () => {
    it("shows the text as it is", () => {
        expect(readmeOf("# Acme\n\nDoes things.")).toEqual({
            kind: "shown",
            markdown: "# Acme\n\nDoes things.",
            truncated: false,
        });
    });

    it("cuts a long README at the limit and says so", () => {
        const readme = readmeOf("a".repeat(README_MAX_LENGTH + 10));
        expect(readme).toEqual({
            kind: "shown",
            markdown: "a".repeat(README_MAX_LENGTH),
            truncated: true,
        });
    });

    it("counts a blank README as none", () => {
        expect(readmeOf(" \n\t\n")).toEqual({ kind: "none" });
    });
});
