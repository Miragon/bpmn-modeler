import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * change-coupling and missed-partner skip what `.gitattributes` marks
 * `linguist-generated`. A pattern that no longer matches would let the files it
 * meant be read again without a sign, so each must match a tracked file.
 */
const REPO_ROOT = normalize(join(__dirname, "../../.."));
const ATTRIBUTES = join(REPO_ROOT, ".gitattributes");
const SETS_GENERATED = /^linguist-generated(=true)?$/;

function generatedPatterns(): string[] {
    if (!existsSync(ATTRIBUTES)) {
        return [];
    }
    return readFileSync(ATTRIBUTES, "utf8")
        .split("\n")
        .map((line) => line.trim().split(/\s+/))
        .filter(([pattern, ...attributes]) => pattern !== "" && !pattern.startsWith("#") && attributes.some((attribute) => SETS_GENERATED.test(attribute)))
        .map(([pattern]) => pattern);
}

// Without a slash a gitattributes pattern matches at any depth; a glob pathspec only at the root.
function pathspecOf(pattern: string): string {
    return pattern.includes("/") ? `:(glob)${pattern.replace(/^\//, "")}` : `:(glob)**/${pattern}`;
}

function matchesTrackedFile(pattern: string): boolean {
    return (
        execFileSync("git", ["ls-files", "--", pathspecOf(pattern)], {
            cwd: REPO_ROOT,
            encoding: "utf8",
        }).trim() !== ""
    );
}

describe("generated files", () => {
    it("every linguist-generated pattern matches a tracked file", () => {
        expect(generatedPatterns().filter((pattern) => !matchesTrackedFile(pattern))).toEqual([]);
    });
});
