/**
 * GUARD-I18N-COVERAGE — the no-gaps guard.
 *
 * A "gap" is a string the running modeler passes to translate() that neither the
 * shared @miragon/bpmn-modeler-i18n library nor this overlay covers: it renders
 * as untranslated English in every non-English locale, silently (the translator
 * falls back without error). `overlayScope` / `overlayNeeded` keep the overlay
 * *minimal*; this keeps coverage *complete*.
 *
 * Runtime truth is the union of `tools/harvested.json` (the C7 modeler),
 * `tools/harvested-dmn.json` (the dmn-js views) and
 * `tools/harvested-template-editor.json` (the element template editor): every
 * template those pages asked to translate, captured by the harvest drivers. Every one of
 * those must resolve via the shared library (exact or normalized) or via the
 * overlay. When this fails, the named keys are genuine gaps — cover them upstream
 * in the shared library, or add them to the overlay (src/languages/*).
 *
 * Caveat: this is only as complete as the harvest snapshots. It cannot see a UI
 * string no harvest has exercised yet — refresh the harvest when the modeler
 * grows new surfaces (see tools/README.md).
 */
import { describe, expect, it } from "vitest";

import { dictionaries } from "@miragon/bpmn-modeler-i18n";

import { readHarvestedKeys } from "./harvestedKeys";
import { extras } from "./languages";
import { normalizeKey } from "./normalizeKey";

const harvested = readHarvestedKeys();

const sharedByNorm = new Set(Object.keys(dictionaries.en).map(normalizeKey));
const overlayKeys = new Set(Object.keys(extras.en ?? {}));

describe("every string the modeler requests is translated (shared ∪ overlay)", () => {
    it("has no harvested key that neither the shared library nor the overlay covers", () => {
        const gaps = harvested.filter(
            (key) => !sharedByNorm.has(normalizeKey(key)) && !overlayKeys.has(key),
        );

        expect(
            gaps,
            "these strings render as English everywhere — cover them upstream in @miragon/bpmn-modeler-i18n or add them to the overlay",
        ).toEqual([]);
    });
});
