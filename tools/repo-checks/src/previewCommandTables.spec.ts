import { readSourceTree, requireMatches } from "@miragon/architecture-testing";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rollup keeps a module-level statement holding an interpolated template
 * literal, so a browser-preview table whose drop reason is one would ship in
 * the production bundle. Every module of every app's browser preview is read,
 * whatever its table file is called.
 */
const APPS_ROOT = normalize(join(__dirname, "../../../apps"));
const PREVIEW_DIR = "/browserPreview/";

const previewModules = requireMatches(
    "browser-preview modules",
    readSourceTree(APPS_ROOT).filter(({ path }) => `/${path}`.includes(PREVIEW_DIR)),
);

describe("browser-preview command tables", () => {
    it.each(previewModules.map(({ path, text }) => ({ path, text })))(
        "writes each drop reason in $path as a plain string, which leaves the table out of the production bundle",
        ({ text }) => {
            expect(text).not.toMatch(/ignored:\s*`/);
        },
    );
});
