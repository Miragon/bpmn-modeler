/**
 * GUARD-I18N-EXTRAS-NEEDED
 *
 * The overlay must carry only keys the running modeler actually asks to
 * translate. `overlayScope` proves a key is *not covered* by the shared library;
 * this proves a key is *needed* at all — the complementary half. Without it the
 * overlay could hoard legacy spellings, unwired dmn-js labels, or diagram/test
 * junk the editor never requests, silently shadowing nothing.
 *
 * Runtime truth is `tools/harvested.json`: every template the running modeler
 * passed to translate(), captured by the harvest driver (see tools/README.md).
 * A key is legitimate iff the harvest recorded it (exact or normalized) — or it
 * is on the SOURCE_ONLY allowlist below: strings our own webview passes to
 * translate() from a feature the harvest driver does not exercise (script-lock),
 * so they cannot appear in the harvest yet are genuinely needed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { extras } from "./languages";

// Mirrors tools/build-overlay.mjs.
const norm = (value: string): string =>
    value
        .toLowerCase()
        .replace(/\bthe\b/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[.\s]+$/, "");

// Kept in sync with SOURCE_ONLY in tools/build-overlay.mjs.
const SOURCE_ONLY = new Set([
    "Read-only",
    "Being edited in",
    "Element actions",
    // Mode-strip labels the webview emits before any surface exists, so the
    // harvest driver (which drives a live modeler) never records them.
    "View",
    "Design",
    "Implement",
    "Mode",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.",
    "{mode} — open properties panel",
]);

const HERE = dirname(fileURLToPath(import.meta.url));
const { keys: harvested } = JSON.parse(
    readFileSync(join(HERE, "..", "tools", "harvested.json"), "utf8"),
) as { keys: string[] };
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
