import { RESOLUTION_SUFFIXES, TYPESCRIPT_FILE } from "@miragon/architecture-testing";
import { describe, expect, it } from "vitest";

import { RELATIVE_IMPORT_SUFFIXES } from "../../../.github/scripts/vitest-target-imports.mjs";

// Vite resolves an extensionless import to .mts, TypeScript never does: the graph leaves it out.
const VITE_ONLY_TYPESCRIPT_SUFFIXES = [".mts"];

const typeScriptSuffixes = (suffixes: readonly string[]) =>
    suffixes.filter((suffix) => TYPESCRIPT_FILE.test(suffix));

describe("a relative import in the Vitest target check", () => {
    it("resolves through the import graph's TypeScript suffixes in its order", () => {
        expect(
            typeScriptSuffixes(RELATIVE_IMPORT_SUFFIXES).filter(
                (suffix) => !VITE_ONLY_TYPESCRIPT_SUFFIXES.includes(suffix),
            ),
        ).toEqual(typeScriptSuffixes(RESOLUTION_SUFFIXES));
    });
});
