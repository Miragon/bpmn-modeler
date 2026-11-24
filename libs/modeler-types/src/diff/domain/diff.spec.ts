import { describe, expect, it } from "vitest";

import { type DiffOrigin, type DiffOriginCapability, diffOriginSupports } from "./diff";

describe("diffOriginSupports", () => {
    it.each<[DiffOrigin, DiffOriginCapability, boolean]>([
        ["compare-files", "namesFiles", true],
        ["compare-files", "namesVersions", false],
        ["compare-files", "swapsSides", true],
        ["scm", "namesFiles", false],
        ["scm", "namesVersions", true],
        ["scm", "swapsSides", false],
        ["merge", "namesFiles", false],
        ["merge", "namesVersions", false],
        ["merge", "swapsSides", false],
        ["merge-result", "namesFiles", false],
        ["merge-result", "namesVersions", false],
        ["merge-result", "swapsSides", false],
    ])("a %s diff: %s is %s", (origin, capability, expected) => {
        expect(diffOriginSupports(origin, capability)).toBe(expected);
    });
});
