import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * change-coupling and missed-partner skip what a tracked `.gitattributes`
 * marks `linguist-generated`. A pattern that no longer matches would let the
 * files it meant be read again without a sign, so each must match a tracked file.
 */
const REPO_ROOT = normalize(join(__dirname, "../../.."));
const SETS_GENERATED = /^linguist-generated(=true)?$/;

interface GeneratedPattern {
    readonly attributesFile: string;
    readonly pattern: string;
}

function gitLines(args: readonly string[]): string[] {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" })
        .split("\n")
        .filter((line) => line !== "");
}

function generatedPatternsIn(attributesFile: string): GeneratedPattern[] {
    return readFileSync(join(REPO_ROOT, attributesFile), "utf8")
        .split("\n")
        .map((line) => line.trim().split(/\s+/))
        .filter(
            ([pattern, ...attributes]) =>
                pattern !== "" &&
                !pattern.startsWith("#") &&
                attributes.some((attribute) => SETS_GENERATED.test(attribute)),
        )
        .map(([pattern]) => ({ attributesFile, pattern }));
}

// A pattern is relative to its file's folder; without a slash it matches at any depth below it.
function pathspecOf({ attributesFile, pattern }: GeneratedPattern): string {
    const folder = dirname(attributesFile);
    const prefix = folder === "." ? "" : `${folder}/`;
    const relative = pattern.includes("/") ? pattern.replace(/^\//, "") : `**/${pattern}`;
    return `:(glob)${prefix}${relative}`;
}

function matchesTrackedFile(generated: GeneratedPattern): boolean {
    return gitLines(["ls-files", "--", pathspecOf(generated)]).length > 0;
}

describe("generated files", () => {
    it("every linguist-generated pattern of a tracked .gitattributes matches a tracked file", () => {
        const stalePatterns = gitLines(["ls-files", "--", ":(glob)**/.gitattributes"])
            .flatMap(generatedPatternsIn)
            .filter((generated) => !matchesTrackedFile(generated));

        expect(stalePatterns).toEqual([]);
    });
});
