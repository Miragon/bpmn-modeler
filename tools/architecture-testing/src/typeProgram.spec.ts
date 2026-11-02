import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readTypeProgram } from "./typeProgram";

describe("readTypeProgram", () => {
    let root: string;

    beforeAll(() => {
        root = mkdtempSync(join(tmpdir(), "type-program-"));
        mkdirSync(join(root, "app/src"), { recursive: true });
        mkdirSync(join(root, "lib"), { recursive: true });
        writeFileSync(
            join(root, "tsconfig.base.json"),
            JSON.stringify({ compilerOptions: { strict: true, outDir: "out" } }),
        );
        writeFileSync(
            join(root, "app/tsconfig.json"),
            JSON.stringify({ extends: "../tsconfig.base.json", include: ["src/**/*.ts"] }),
        );
        const fromMain = "../../lib/lib";
        // Interpolated, so the trigger-path check does not read the fixture import as the spec's own.
        writeFileSync(
            join(root, "app/src/main.ts"),
            `import { lib } from "${fromMain}";\nlib();\n`,
        );
        writeFileSync(join(root, "lib/lib.ts"), "export function lib(): void {}\n");
        writeFileSync(
            join(root, "app/tsconfig.empty.json"),
            JSON.stringify({ include: ["none/*.ts"] }),
        );
    });

    afterAll(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it("type-checks the config's files and the files they import, emitting nothing", () => {
        const program = readTypeProgram(join(root, "app/tsconfig.json"));
        const lib = program
            .getSourceFiles()
            .find(({ fileName }) => fileName.endsWith("/lib/lib.ts"));

        expect(program.getCompilerOptions()).toMatchObject({ strict: true, noEmit: true });
        expect(program.getRootFileNames().map((fileName) => fileName.slice(root.length))).toEqual([
            "/app/src/main.ts",
        ]);
        expect(lib).toBeDefined();
    });

    it.each([
        { case: "a config that does not exist", config: "app/tsconfig.missing.json" },
        { case: "a config that matches no file", config: "app/tsconfig.empty.json" },
    ])("throws on $case", ({ config }) => {
        expect(() => readTypeProgram(join(root, config))).toThrow(join(root, config));
    });
});
