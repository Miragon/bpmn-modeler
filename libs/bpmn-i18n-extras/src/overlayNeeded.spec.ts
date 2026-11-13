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
import { describe, expect, it } from "vitest";

import { readHarvestedKeys } from "./harvestedKeys";
import { extras } from "./languages";
import { normalizeKey } from "./normalizeKey";
import { SOURCE_ONLY } from "./sourceOnlyKeys";

const harvestedByNorm = new Set(readHarvestedKeys().map(normalizeKey));

describe("i18n extras carry only keys the modeler requests", () => {
    const overlayKeys = Object.keys(extras.en ?? {});

    it("holds no key the runtime harvest never requested", () => {
        const unrequested = overlayKeys.filter(
            (key) => !SOURCE_ONLY.has(key) && !harvestedByNorm.has(normalizeKey(key)),
        );

        expect(
            unrequested,
            "these overlay keys are never requested at runtime — remove them from src/languages/* (or add to SOURCE_ONLY if the harvest structurally can't reach them)",
        ).toEqual([]);
    });
});
