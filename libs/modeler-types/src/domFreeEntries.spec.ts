import { describe, expect, it } from "vitest";

import tsconfigBaseText from "../../../tsconfig.base.json?raw";

const LIBRARY_SOURCE_ROOT = "./libs/modeler-types/src/";
const RUNTIME_IMPORT = /^(?:import|export)\s(?!type\s)(?:[^;]*from\s+)?["']/m;

const sources = import.meta.glob<string>("./*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
});

const subpathFiles = Object.entries(
    (JSON.parse(tsconfigBaseText) as { compilerOptions: { paths: Record<string, string[]> } })
        .compilerOptions.paths,
)
    .filter(([specifier]) => specifier.startsWith("@miragon/bpmn-modeler-types/"))
    .flatMap(([specifier, targets]) =>
        targets.map((target): [string, string] => [specifier, target]),
    );

// A subpath exists so that a workspace compiled without the DOM lib can load one file
// instead of the barrel; `import type` is erased and stays allowed.
describe("the subpath entries of tsconfig.base.json", () => {
    it("name at least the engine rule, so the table below cannot pass empty", () => {
        expect(subpathFiles).toContainEqual([
            "@miragon/bpmn-modeler-types/engine",
            `${LIBRARY_SOURCE_ROOT}engine.ts`,
        ]);
    });

    it.each(subpathFiles)("%s (%s) imports nothing at runtime", (_specifier, target) => {
        expect(target.startsWith(LIBRARY_SOURCE_ROOT)).toBe(true);
        const source = sources[`./${target.slice(LIBRARY_SOURCE_ROOT.length)}`];

        expect(source).toBeDefined();
        expect(source).not.toMatch(RUNTIME_IMPORT);
    });
});
