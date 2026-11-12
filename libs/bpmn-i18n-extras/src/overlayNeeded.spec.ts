/**
 * GUARD-I18N-EXTRAS-NEEDED
 *
 * The overlay must carry only keys the running modeler actually asks to
 * translate. `overlayScope` proves a key is *not covered* by the shared library;
 * this proves a key is *needed* at all — the complementary half. Without it the
 * overlay could hoard legacy spellings, unwired dmn-js labels, or diagram/test
 * junk the editor never requests, silently shadowing nothing.
 *
 * Runtime truth is the union of `tools/harvested.json` (the C7 modeler),
 * `tools/harvested-dmn.json` (the dmn-js views) and
 * `tools/harvested-template-editor.json` (the element template editor): every
 * template those pages passed to translate(), captured by the harvest drivers (see
 * tools/README.md). A key is legitimate iff a harvest recorded it (exact or
 * normalized) — or it is on the SOURCE_ONLY allowlist in sourceOnlyKeys.ts,
 * shared with tools/build-overlay.mjs: strings our own webview passes to
 * translate() from a feature the harvest driver does not exercise, so they
 * cannot appear in the harvest yet are genuinely needed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { extras } from "./languages";
import { SOURCE_ONLY } from "./sourceOnlyKeys";

// Mirrors tools/build-overlay.mjs.
const norm = (value: string): string =>
    value
        .toLowerCase()
        .replace(/\bthe\b/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[.\s]+$/, "");

const HERE = dirname(fileURLToPath(import.meta.url));
const readHarvest = (file: string): string[] =>
    (JSON.parse(readFileSync(join(HERE, "..", "tools", file), "utf8")) as { keys: string[] }).keys;
const harvested = [
    ...new Set([
        ...readHarvest("harvested.json"),
        ...readHarvest("harvested-dmn.json"),
        ...readHarvest("harvested-template-editor.json"),
    ]),
];
const harvestedByNorm = new Set(harvested.map(norm));

describe("i18n extras carry only keys the modeler requests", () => {
    const overlayKeys = Object.keys(extras.en ?? {});

    it("holds no key the runtime harvest never requested", () => {
        const unrequested = overlayKeys.filter(
            (key) => !SOURCE_ONLY.has(key) && !harvestedByNorm.has(norm(key)),
        );

        expect(
            unrequested,
            "these overlay keys are never requested at runtime — remove them from src/languages/* (or add to SOURCE_ONLY if the harvest structurally can't reach them)",
        ).toEqual([]);
    });
});
