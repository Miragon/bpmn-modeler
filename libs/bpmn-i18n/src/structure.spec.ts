/**
 * STRUCT-COLOCATION
 *
 * The clean shape of `languages/**` — one directory per locale, each holding
 * exactly the four dictionary slices plus a barrel — is upheld only by
 * discipline. This guardrail pins it: a locale that forgets a slice, adds a
 * stray file, or is registered in one place but not another fails CI instead of
 * silently shipping a partial dictionary.
 *
 * It also closes the `SupportedLocale`-declared-in-three-places gap: the locale
 * directories on disk, the `supportedLanguages` catalogue, and the
 * `dictionaries` map must name the same locale set. A locale added to one but
 * not the others (e.g. in the array but missing from `dictionaries`) fails
 * type-silently at runtime; here it fails loudly.
 */
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { dictionaries, supportedLanguages, type SupportedLocale } from "./languages";

const languagesDir = join(dirname(fileURLToPath(import.meta.url)), "languages");

// The five canonical files every locale directory must contain — the four
// dictionary slices merged by index.ts, plus the index barrel itself.
const CANONICAL_FILES = [
    "index.ts",
    "bpmn-js.ts",
    "dmn-js.ts",
    "properties-panel.ts",
    "other.ts",
].sort();

const localeDirs = readdirSync(languagesDir).filter((entry) =>
    statSync(join(languagesDir, entry)).isDirectory(),
);

describe("i18n structure", () => {
    it.each(localeDirs)("%s contains exactly the canonical slice files", (locale) => {
        const files = readdirSync(join(languagesDir, locale)).sort();
        expect(files).toEqual(CANONICAL_FILES);
    });

    it("locale directories, catalogue and dictionary map name the same locales", () => {
        const fromDisk = [...localeDirs].sort();
        const fromCatalogue = supportedLanguages.map((entry) => entry.locale).sort();
        const fromDictionaries = (Object.keys(dictionaries) as SupportedLocale[]).sort();

        expect(fromCatalogue).toEqual(fromDisk);
        expect(fromDictionaries).toEqual(fromDisk);
    });
});
