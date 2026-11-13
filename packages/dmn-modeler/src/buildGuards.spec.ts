import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkDts } from "../scripts/check-dts.mjs";

const temporaryDirectories: string[] = [];

function distWithIndexDts(indexDts: string): string {
    const root = mkdtempSync(join(tmpdir(), "dmn-modeler-guard-"));
    temporaryDirectories.push(root);
    const distDir = join(root, "dist");
    mkdirSync(distDir);
    writeFileSync(join(distDir, "index.d.ts"), indexDts);
    return distDir;
}

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe("declaration roll-up guard", () => {
    it("accepts a clean entry", () => {
        const distDir = distWithIndexDts("export declare function createModeler(): void;\n");

        expect(checkDts({ distDir })).toEqual({ checkedEntries: 1 });
    });

    it("rejects a declared internal diff viewer function", () => {
        const distDir = distWithIndexDts(
            "export declare function createDiffViewer(container: HTMLElement): unknown;\n",
        );

        expect(() => checkDts({ distDir })).toThrow(/declares internal: createDiffViewer/);
    });

    it.each([
        ["DmnDiffMarkOptions", "export declare interface DmnDiffMarkOptions {}\n"],
        ["DmnDiffMarks", "export declare interface DmnDiffMarks {}\n"],
        ["DmnDiffViewerHandle", "declare interface DmnDiffViewerHandle {}\n"],
        ["DmnDiffViewerOptions", "export declare interface DmnDiffViewerOptions {}\n"],
        ["DmnDiffStatus", 'export declare type DmnDiffStatus = "added";\n'],
        ["DmnTableMarks", "export declare interface DmnTableMarks {}\n"],
    ])("rejects the declared internal diff type %s", (name, declaration) => {
        const distDir = distWithIndexDts(declaration);

        expect(() => checkDts({ distDir })).toThrow(`declares internal: ${name} `);
    });

    it("accepts the comment API Extractor leaves for a trimmed declaration", () => {
        const distDir = distWithIndexDts(
            "/* Excluded from this release type: createDiffViewer */\n" +
                "/* Excluded from this release type: DmnTableMarks */\n" +
                "export declare function createModeler(): void;\n",
        );

        expect(() => checkDts({ distDir })).not.toThrow();
    });

    it("rejects a leaked protocol symbol", () => {
        const distDir = distWithIndexDts("export declare const api: HostApi;\n");

        expect(() => checkDts({ distDir })).toThrow(/leaked private symbols: HostApi/);
    });

    it("rejects a missing build output", () => {
        const root = mkdtempSync(join(tmpdir(), "dmn-modeler-guard-"));
        temporaryDirectories.push(root);

        expect(() => checkDts({ distDir: join(root, "dist") })).toThrow(
            /not found — run the lib build first/,
        );
    });
});
