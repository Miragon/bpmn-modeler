import { describe, expect, it } from "vitest";

import { globToRegExp, matchesGlobs } from "../../../.github/scripts/glob.mjs";

describe("the globs of the .github registries", () => {
    it.each([
        { glob: "libs/diff/**", file: "libs/diff/src/a/b.ts", matches: true },
        { glob: "libs/diff/**", file: "libs/diff-view/src/a.ts", matches: false },
        { glob: "**/*.spec.ts", file: "a.spec.ts", matches: true },
        { glob: "**/*.spec.ts", file: "libs/x/src/a.spec.ts", matches: true },
        { glob: "**/*.spec.ts", file: "libs/x/src/a.spec.tsx", matches: false },
        { glob: "apps/webview/src/diff*", file: "apps/webview/src/diffMode.ts", matches: true },
        { glob: "apps/webview/src/diff*", file: "apps/webview/src/diff/a.ts", matches: false },
        { glob: "**/__fixtures__/**", file: "libs/x/src/__fixtures__/a.bpmn", matches: true },
        { glob: "apps/a.b/x.ts", file: "apps/aXb/x.ts", matches: false },
        { glob: "**", file: "yarn.lock", matches: true },
    ])("$glob matches $file: $matches", ({ glob, file, matches }) => {
        expect(globToRegExp(glob).test(file)).toBe(matches);
    });

    it.each([
        { file: "libs/types/src/index.ts", matches: true },
        { file: "libs/types/src/merge.ts", matches: false },
        { file: "libs/shared/src/index.ts", matches: false },
    ])("takes back a file a `!` glob matches: $file $matches", ({ file, matches }) => {
        expect(matchesGlobs(["libs/types/**", "!libs/types/src/merge.ts"], file)).toBe(matches);
    });

    it("matches nothing with only `!` globs", () => {
        expect(matchesGlobs(["!libs/types/src/merge.ts"], "libs/types/src/index.ts")).toBe(false);
    });
});
