/**
 * GUARD-I18N-EXTRAS-NEEDED
 *
 * The overlay must carry only keys the running modeler actually asks to
 * translate. `overlayScope` proves a key is *not covered* by the shared library;
 * this proves a key is *needed* at all — the complementary half. Without it the
 * overlay could hoard legacy spellings, unwired dmn-js labels, or diagram/test
 * junk the editor never requests, silently shadowing nothing.
 *
 * Runtime truth is the union of the harvests (`readHarvestedKeys` in
 * harvestedKeys.ts): every template the harvested pages passed to translate(),
 * captured by the harvest drivers and, for the merge view, by
 * apps/bpmn-webview/src/domain/mergeTextsTranslated.spec.ts (see tools/README.md).
 * A key is legitimate iff a harvest recorded it (exact or normalized) — or it is
 * on the SOURCE_ONLY allowlist in sourceOnlyKeys.ts, shared with
 * tools/build-overlay.mjs: strings our own webview passes to translate() from a
 * call site no harvest reaches, so they cannot appear in a harvest yet are
 * genuinely needed.
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
            "these overlay keys are never requested at runtime — remove them from src/languages/*. A merge view text: ask it in apps/bpmn-webview/src/domain/mergeTextsTranslated.spec.ts and rerecord tools/harvested-merge.json. Any other text no harvest driver can reach: add it to SOURCE_ONLY",
        ).toEqual([]);
    });
});
