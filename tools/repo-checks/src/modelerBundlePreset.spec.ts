import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Each modeler bundle takes its JSX transform and dedupe list from the root preset,
 * so a copy of its own drifts from the other bundles again.
 */
const REPO_ROOT = normalize(join(__dirname, "../../.."));

function readRepoFile(path: string): string {
    return readFileSync(join(REPO_ROOT, path), "utf8");
}

const MODELER_BUNDLE_CONFIGS = [
    "apps/bpmn-webview/vite.config.mts",
    "apps/dmn-webview/vite.config.mts",
    "apps/orca-plugin/vite.editor.mts",
    "packages/bpmn-modeler/vite.config.mts",
];

const OWN_TRANSFORM_OR_DEDUPE = /^\s*(?:dedupe|esbuild|oxc):/m;
const OWN_RESOLVE = /^\s*resolve:\s*\{/m;

describe("the modeler bundle preset", () => {
    it("is exported from the root vite.shared.ts with a JSX transform and a dedupe list", () => {
        const preset = readRepoFile("vite.shared.ts");

        expect(preset).toMatch(/export const modelerBundlePreset\b/);
        expect(preset).toMatch(/^\s*oxc:/m);
        expect(preset).toMatch(/^\s*dedupe:/m);
    });

    it.each(MODELER_BUNDLE_CONFIGS)("is spread by %s", (configPath) => {
        expect(readRepoFile(configPath)).toMatch(/\.\.\.modelerBundlePreset,/);
    });

    it.each(MODELER_BUNDLE_CONFIGS)(
        "is not overridden by a JSX transform or dedupe list in %s",
        (configPath) => {
            expect(readRepoFile(configPath)).not.toMatch(OWN_TRANSFORM_OR_DEDUPE);
        },
    );

    it.each(MODELER_BUNDLE_CONFIGS)("keeps its resolve entries in %s", (configPath) => {
        const config = readRepoFile(configPath);
        if (OWN_RESOLVE.test(config)) {
            expect(config).toMatch(/\.\.\.modelerBundlePreset\.resolve\b/);
        }
    });
});
