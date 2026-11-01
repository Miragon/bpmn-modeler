import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readSourceTree } from "./sourceTree";

describe("readSourceTree", () => {
    let root: string;

    beforeAll(() => {
        root = mkdtempSync(join(tmpdir(), "source-tree-"));
        for (const path of [
            "index.ts",
            "feature/view.tsx",
            "feature/domain/model.ts",
            "feature/domain/model.spec.ts",
            "feature/view.test.tsx",
            "types/ambient.d.ts",
            "styles/theme.css",
            "node_modules/dep/index.ts",
            "dist/index.ts",
            "coverage/report.ts",
            "__fixtures__/sample.ts",
            "lib/vendored.ts",
        ]) {
            mkdirSync(dirname(join(root, path)), { recursive: true });
            writeFileSync(join(root, path), `// ${path}`);
        }
    });

    afterAll(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it("lists sources as sorted POSIX paths with their text", () => {
        expect(readSourceTree(root)).toEqual([
            { path: "feature/domain/model.ts", text: "// feature/domain/model.ts" },
            { path: "feature/view.tsx", text: "// feature/view.tsx" },
            { path: "index.ts", text: "// index.ts" },
            { path: "lib/vendored.ts", text: "// lib/vendored.ts" },
        ]);
    });

    it("includes specs on request", () => {
        expect(readSourceTree(root, { includeSpecs: true }).map(({ path }) => path)).toEqual([
            "feature/domain/model.spec.ts",
            "feature/domain/model.ts",
            "feature/view.test.tsx",
            "feature/view.tsx",
            "index.ts",
            "lib/vendored.ts",
        ]);
    });

    it("skips the given directories instead of the defaults", () => {
        expect(
            readSourceTree(root, { skipDirs: ["lib", "feature", "dist"] }).map(({ path }) => path),
        ).toEqual([
            "__fixtures__/sample.ts",
            "coverage/report.ts",
            "index.ts",
            "node_modules/dep/index.ts",
        ]);
    });

    it("reads other extensions on request", () => {
        expect(readSourceTree(root, { extensions: [".css"] }).map(({ path }) => path)).toEqual([
            "styles/theme.css",
        ]);
    });
});
