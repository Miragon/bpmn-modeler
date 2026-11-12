/**
 * Prunes the overlay of every language the modeler offers against runtime
 * truth. Run with bun: it imports the TS sources, whose extensionless imports
 * Node cannot resolve, and the shared library directly.
 *
 *   bun libs/bpmn-i18n-extras/tools/build-overlay.mjs           # report only
 *   bun libs/bpmn-i18n-extras/tools/build-overlay.mjs --write   # rewrite files
 *
 * An overlay key earns its place only when the running modeler asks to
 * translate that string AND the shared @miragon/bpmn-modeler-i18n library has no
 * entry for it (exact or normalized). The C7 properties-panel strings the
 * overlay used to carry are now a first-class overlay in the shared library, so
 * they collide and drop out here. Three groups of keys are dead and pruned:
 *
 *   - shared-covered: the shared library ships the key (exact) or a modern twin
 *     of it (normalized). The modeler requests the shared form, so the local
 *     override is never used. This is the bulk — all the upstreamed C7 strings.
 *   - not-requested: no shared twin, but the harvest never recorded the modeler
 *     asking for it either — a legacy bpmn-js spelling the editor renamed or
 *     diagram/test junk. Dead by runtime truth. (Both the BPMN and DMN harvests
 *     feed the needed-key set now, so a live dmn-js label is no longer a drop
 *     reason — it survives via the normal keep rule.)
 *
 * Kept: keys with no shared twin that the harvest recorded (genuine gaps), plus
 * the SOURCE_ONLY allowlist in src/sourceOnlyKeys.ts — strings our own webview
 * passes to translate() that the harvest driver structurally can't reach.
 *
 * Normalization mirrors the plugin repo's drift tooling: lowercase, collapse
 * whitespace, drop the word "the", strip trailing "." / spaces.
 */
/* global console, process */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { dictionaries as shared } from "@miragon/bpmn-modeler-i18n";

import { extras, supportedModelerLanguages } from "../src/index.ts";
import { SOURCE_ONLY } from "../src/sourceOnlyKeys.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const LANG_DIR = join(HERE, "..", "src", "languages");
const write = process.argv.includes("--write");

const norm = (s) =>
    s
        .toLowerCase()
        .replace(/\bthe\b/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[.\s]+$/, "");

// The needed-key set is the union of the harvests: the C7 modeler
// (harvest-drain.js), the dmn-js views (harvest-drain-dmn.js) and the element
// template editor (harvest-drain-template-editor.js) request mostly disjoint
// strings, and all must survive pruning.
const readKeys = (file) => JSON.parse(readFileSync(join(HERE, file), "utf8")).keys;
const harvested = [
    ...new Set([
        ...readKeys("harvested.json"),
        ...readKeys("harvested-dmn.json"),
        ...readKeys("harvested-template-editor.json"),
    ]),
];
const harvestedByNorm = new Set(harvested.map(norm));
const sharedByNorm = new Set(Object.keys(shared.en).map(norm));

const en = extras.en;

const keep = (k) =>
    SOURCE_ONLY.has(k) || (!sharedByNorm.has(norm(k)) && harvestedByNorm.has(norm(k)));

const dead = Object.keys(en).filter((k) => !keep(k));
const deadSet = new Set(dead);
const sharedCovered = dead.filter((k) => sharedByNorm.has(norm(k)));
const notRequested = dead.filter((k) => !sharedByNorm.has(norm(k)));

console.log(
    `overlay: ${Object.keys(en).length} | dead: ${dead.length} (shared-covered ${sharedCovered.length}, not-requested ${notRequested.length}) | kept: ${Object.keys(en).length - dead.length}`,
);
if (notRequested.length)
    console.log(
        `\nnot-requested (legacy/unwired/junk):\n${notRequested.map((k) => `  drop ${JSON.stringify(k)}`).join("\n")}`,
    );

if (!write) {
    console.log("\n(dry run — pass --write to rewrite the locale files)");
    process.exit(0);
}

const HEADER = `/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */`;

for (const { locale } of supportedModelerLanguages) {
    const dict = extras[locale];
    const pruned = Object.fromEntries(Object.entries(dict).filter(([k]) => !deadSet.has(k)));
    const body = `${HEADER}\nconst dictionary: Record<string, string> = ${JSON.stringify(pruned, null, 4)};\n\nexport default dictionary;\n`;
    writeFileSync(join(LANG_DIR, `${locale}.ts`), body);
}
console.log(`\nrewrote ${supportedModelerLanguages.length} locale files.`);
