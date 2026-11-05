import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const app = resolve(__dirname, "..");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

interface OrcaManifest {
    id: string;
    version: string;
    contributes: { customEditors: { id: string; extensions: string[]; entry: string }[] };
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

    it("opens .bpmn and .dmn, each from an editor page and a bundle of its own", () => {
        const editors = manifest.contributes.customEditors;
        expect(editors.map((editor) => editor.extensions)).toEqual([[".bpmn"], [".dmn"]]);
        for (const editor of editors) {
            expect(existsSync(resolve(app, editor.entry))).toBe(true);
            expect(existsSync(resolve(app, `vite.${editor.id}.config.mts`))).toBe(true);
            expect(existsSync(resolve(app, `src/${editor.id}.ts`))).toBe(true);
        }
    });
});
