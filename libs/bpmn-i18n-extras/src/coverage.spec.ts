/**
 * GUARD-I18N-COVERAGE — the no-gaps guard.
 *
 * A "gap" is a string the running modeler passes to translate() that neither the
 * shared @miragon/bpmn-modeler-i18n library nor this overlay covers: it renders
 * as untranslated English in every non-English locale, silently (the translator
 * falls back without error). `overlayScope` / `overlayNeeded` keep the overlay
 * *minimal*; this keeps coverage *complete*.
 *
 * Runtime truth is the union of `tools/harvested.json` (the C7 modeler) and
 * `tools/harvested-dmn.json` (the dmn-js views): every template either running
 * modeler asked to translate, captured by the harvest drivers. Every one of
 * those must resolve via the shared library (exact or normalized) or via the
 * overlay. When this fails, the named keys are genuine gaps — cover them upstream
 * in the shared library, or add them to the overlay (src/languages/*).
 *
 * Caveat: this is only as complete as the harvest snapshots. It cannot see a UI
 * string no harvest has exercised yet — refresh the harvest when the modeler
 * grows new surfaces (see tools/README.md).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { dictionaries } from "@miragon/bpmn-modeler-i18n";

import { extras } from "./languages";

// Mirrors tools/build-overlay.mjs and the plugin repo's drift tooling.
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
    ...new Set([...readHarvest("harvested.json"), ...readHarvest("harvested-dmn.json")]),
];

const sharedByNorm = new Set(Object.keys(dictionaries.en).map(norm));
const overlayKeys = new Set(Object.keys(extras.en ?? {}));

describe("every string the modeler requests is translated (shared ∪ overlay)", () => {
    it("has no harvested key that neither the shared library nor the overlay covers", () => {
        const gaps = harvested.filter(
            (key) => !sharedByNorm.has(norm(key)) && !overlayKeys.has(key),
        );

        expect(
            gaps,
            "these strings render as English everywhere — cover them upstream in @miragon/bpmn-modeler-i18n or add them to the overlay",
        ).toEqual([]);
    });
});
