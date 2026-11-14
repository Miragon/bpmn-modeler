import { describe, expect, it } from "vitest";

import { README_MAX_LENGTH, readmeFileNameIn, readmeOf } from "./addOnReadme";

describe("readmeFileNameIn", () => {
    it("finds README.md in any case", () => {
        expect(
            readmeFileNameIn([
                ["index.js", "file"],
                ["readme.MD", "file"],
            ]),
        ).toBe("readme.MD");
    });

    it("prefers a Markdown README over a plain one", () => {
        expect(
            readmeFileNameIn([
                ["README", "file"],
                ["README.markdown", "file"],
                ["README.md", "file"],
            ]),
        ).toBe("README.md");
        expect(
            readmeFileNameIn([
                ["README", "file"],
                ["README.markdown", "file"],
            ]),
        ).toBe("README.markdown");
    });

    it("passes over a folder named like a README and other files", () => {
        expect(
            readmeFileNameIn([
                ["README.md", "directory"],
                ["README.txt", "file"],
                ["CHANGELOG.md", "file"],
            ]),
        ).toBeUndefined();
    });
});

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
