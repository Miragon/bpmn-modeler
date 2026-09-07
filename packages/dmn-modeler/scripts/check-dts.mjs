// The published type surface must not leak the private webview↔host protocol,
// the engine core, an un-bundled private workspace lib, or dmn-js itself. Fails
// the build if the rolled-up `dist/index.d.ts` names a protocol symbol
// (`HostApi`/`Query`/`Command`), references `@miragon/bpmn-modeler-shared` /
// `@miragon/bpmn-modeler-core`, imports a private workspace lib (those are
// inlined, so a surviving import means the roll-up leaked a dependency the
// consumer cannot install), or imports `dmn-js` (consumers lack our ambient
// `src/types/*.d.ts`, so a surviving `from "dmn-js"` would not type-check).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const ENTRY_DTS = ["index.d.ts"];

// Whole-word protocol type names + the private protocol/engine packages, plus a
// bare `dmn-js` module specifier (the ambient types must not leak into the dist).
const FORBIDDEN_CONTENT =
    /\bHostApi\b|\bQuery\b|\bCommand\b|@miragon\/bpmn-modeler-shared|@miragon\/bpmn-modeler-core|\bfrom\s+["']dmn-js/g;

// Private workspace libs are inlined at build time — none may survive as an
// import in the flattened d.ts. `@miragon/bpmn-modeler-diff` is transitively
// reachable through the modeler-types barrel, so guard it too.
const PRIVATE_LIBS = [
    "@miragon/bpmn-modeler-types",
    "@miragon/bpmn-modeler-i18n-extras",
    "@miragon/bpmn-modeler-diff",
];

function checkEntry(fileName) {
    const dtsPath = resolve(distDir, fileName);
    let dts;
    try {
        dts = readFileSync(dtsPath, "utf8");
    } catch {
        console.error(`check-dts: ${dtsPath} not found — run the lib build first.`);
        process.exit(1);
    }

    const failures = [];

    const contentHits = [...dts.matchAll(FORBIDDEN_CONTENT)].map((m) => m[0]);
    if (contentHits.length > 0) {
        failures.push(`leaked private symbols: ${[...new Set(contentHits)].join(", ")}`);
    }

    // Invalid-ambient guard: a function re-exported from a bundled lib can be
    // rolled up with its implementation *body*, producing `declare function …() {`
    // or `declare async function …` — both illegal in a `.d.ts`.
    if (
        /\bdeclare\s+async\s+function\b/.test(dts) ||
        /\bdeclare\s+function\b[^;{]*\)[^;]*\{/.test(dts)
    ) {
        failures.push(
            "invalid ambient declaration: a `declare function` carries a body " +
                "(surface it as a local wrapper so the dts plugin emits a clean signature)",
        );
    }

    for (const lib of PRIVATE_LIBS) {
        const escaped = lib.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
        if (new RegExp(`["']${escaped}(/[^"']*)?["']`).test(dts)) {
            failures.push(`leaked private-lib import: ${lib}`);
        }
    }

    if (failures.length > 0) {
        console.error(
            `check-dts: dist/${fileName} leaks private surface:\n  ` + failures.join("\n  "),
        );
        process.exit(1);
    }

    console.log(`check-dts: dist/${fileName} is clean.`);
}

for (const entry of ENTRY_DTS) {
    checkEntry(entry);
}
