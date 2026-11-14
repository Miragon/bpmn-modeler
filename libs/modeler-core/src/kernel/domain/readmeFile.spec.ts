import { describe, expect, it } from "vitest";

import { readmeFileNameIn } from "./readmeFile";

describe("readmeFileNameIn", () => {
    it("finds README.md in any case", () => {
        expect(readmeFileNameIn(["index.js", "readme.MD"])).toBe("readme.MD");
    });

    it("prefers a Markdown README over a plain one", () => {
        expect(readmeFileNameIn(["README", "README.markdown", "README.md"])).toBe("README.md");
        expect(readmeFileNameIn(["README", "README.markdown"])).toBe("README.markdown");
    });

    it("passes over other files", () => {
        expect(readmeFileNameIn(["README.txt", "CHANGELOG.md", "README.md.bak"])).toBeUndefined();
    });
});
