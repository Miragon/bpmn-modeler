/**
 * The bridge that keeps the modeler-internal strings translated after the swap
 * to the shared library: `i18n.extend(extras)` must make those keys resolve in a
 * non-English locale, and the shared library's own keys must keep working. Runs
 * against the real shared `i18n` singleton the webviews use.
 */
import { afterEach, describe, expect, it } from "vitest";

import { i18n } from "@miragon/bpmn-modeler-i18n";

import { extras } from "./languages";

afterEach(() => {
    i18n.setLanguage("en");
});

describe("i18n.extend(extras)", () => {
    // A script-lock badge string the webview emits verbatim with no counterpart
    // in the shared library — the overlay must carry it.
    const OVERLAY_KEY = "Read-only";

    it("translates a modeler-internal key the shared library lacks", () => {
        i18n.extend(extras);
        i18n.setLanguage("de");

        expect(i18n.translate(OVERLAY_KEY)).toBe(extras.de![OVERLAY_KEY]);
        expect(i18n.translate(OVERLAY_KEY)).not.toBe(OVERLAY_KEY);
    });

    it("still resolves the shared library's own keys after extending", () => {
        i18n.extend(extras);
        i18n.setLanguage("de");

        // The overlay owns the badge string; "Remove" is a context-pad key owned
        // by the shared library — both must resolve to their German value.
        expect(i18n.translate(OVERLAY_KEY)).toBe(extras.de![OVERLAY_KEY]);
        expect(i18n.translate("Remove")).toBe("Entfernen");
    });

    it("keeps the overlay applied across a later language switch", () => {
        i18n.extend(extras);

        i18n.setLanguage("es");
        expect(i18n.translate(OVERLAY_KEY)).toBe(extras.es![OVERLAY_KEY]);

        i18n.setLanguage("fr");
        expect(i18n.translate(OVERLAY_KEY)).toBe(extras.fr![OVERLAY_KEY]);
    });
});
