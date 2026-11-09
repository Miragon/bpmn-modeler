import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const app = resolve(__dirname, "..");
const ORCA_MAX_TEMPLATE_BYTES = 256 * 1024;
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

interface OrcaManifest {
    id: string;
    version: string;
    contributes: {
        customEditors: { id: string; extensions: string[]; entry: string }[];
        newFiles: { extension: string; template: string }[];
    };
}

const manifest = readJson<OrcaManifest>(resolve(app, "orca-plugin.json"));
const releaseConfig = readJson<{
    packages: Record<string, { "extra-files"?: { path: string; jsonpath: string }[] }>;
}>(resolve(app, "../../release-please-config.json"));

describe("the Orca plugin's manifest", () => {
    it("is the id Miragon/orca-modelers allows this repository to publish", () => {
        expect(manifest.id).toBe("bpmn-modeler");
    });

    it("carries the workspace's version, which release-please bumps in both", () => {
        expect(manifest.version).toBe(
            readJson<{ version: string }>(resolve(app, "package.json")).version,
        );
        expect(releaseConfig.packages["apps/orca-plugin"]?.["extra-files"]).toContainEqual(
            expect.objectContaining({ path: "orca-plugin.json", jsonpath: "$.version" }),
        );
    });

    it("opens .bpmn and .dmn, each from an editor page that starts its own entry", () => {
        const editors = manifest.contributes.customEditors;
        expect(editors.map((editor) => editor.extensions)).toEqual([[".bpmn"], [".dmn"]]);
        for (const editor of editors) {
            const page = readFileSync(resolve(app, editor.entry), "utf8");
            expect(page).toContain(`src="../../src/${editor.id}.ts"`);
            expect(existsSync(resolve(app, `src/${editor.id}.ts`))).toBe(true);
            expect(readFileSync(resolve(app, "vite.editor.mts"), "utf8")).toContain(
                `"${editor.entry}"`,
            );
        }
    });

    it("starts a new BPMN process first, which Try it opens, then a new DMN decision", () => {
        expect(manifest.contributes.newFiles.map((newFile) => newFile.extension)).toEqual([
            ".bpmn",
            ".dmn",
        ]);
    });

    it("starts each new file from a template within Orca's limit, which the build ships", () => {
        const assembly = readFileSync(resolve(app, "scripts/assemble-plugin.mjs"), "utf8");
        expect(assembly).toContain('join(app, "templates")');
        for (const { template } of manifest.contributes.newFiles) {
            expect(statSync(resolve(app, template)).size).toBeLessThanOrEqual(
                ORCA_MAX_TEMPLATE_BYTES,
            );
        }
    });
});
