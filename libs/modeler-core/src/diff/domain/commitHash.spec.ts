import { describe, expect, it } from "vitest";

import { isFullCommitHash, shortCommitHash } from "./commitHash";

const SHA1 = "50c2dafff8768a8fad0682a359d7946145e5f5a7";
const SHA256 = `${SHA1}${"0123456789abcdef01234567"}`;

describe("isFullCommitHash", () => {
    it.each([
        [SHA1, true],
        [SHA256, true],
        [SHA1.toUpperCase(), true],
        [SHA1.slice(0, 7), false],
        [`${SHA1}0`, false],
        ["feature", false],
        [`${SHA1}^`, false],
    ])("%s → %s", (text, expected) => {
        expect(isFullCommitHash(text)).toBe(expected);
    });
});

describe("shortCommitHash", () => {
    it("cuts a commit hash as the Git extension names a commit", () => {
        expect(shortCommitHash(SHA1)).toBe("50c2daf");
    });
});
