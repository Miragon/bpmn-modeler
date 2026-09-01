// Acceptance-criterion 3 (issue #1376), mechanised: the published type surface
// must not leak the private webview↔host protocol. Fails the build if a
// rolled-up entry `.d.ts` names a protocol symbol (`HostApi`/`Query`/
// `Command`), references `@miragon/bpmn-modeler-shared`, or imports any private
// workspace lib name (those are inlined, so a surviving import means the d.ts
// roll-up leaked an un-bundled dependency the consumer cannot install).
//
// All three public entries are checked — the root `dist/index.d.ts`, the
// `dist/diff.d.ts` data-layer subpath (#1378), and the `dist/lint.d.ts`
// injectable-lint subpath (#1407).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const ENTRY_DTS = ["index.d.ts", "diff.d.ts", "lint.d.ts"];

// Whole-word protocol type names + the private protocol package. The word gate
// also covers public diff jsdoc: a bare `Query`/`Command`/`HostApi` in a
// comment would trip it (d.ts jsdoc survives the roll-up).
const FORBIDDEN_CONTENT =
    /\bHostApi\b|\bQuery\b|\bCommand\b|@miragon\/bpmn-modeler-shared|@miragon\/bpmn-modeler-core/g;

// Private workspace libs are inlined at build time — none may survive as an
// import in the flattened d.ts. The public npm `@miragon/*` packages
// (`-i18n`, `bpmnlint-plugin-rules`, `create-append-c7`) are allowed.
const PRIVATE_LIBS = [
    "@miragon/bpmn-modeler-types",
    "@miragon/bpmn-modeler-diff",
    "@miragon/bpmn-modeler-clipboard",
    "@miragon/bpmn-modeler-i18n-extras",
    "@miragon/bpmn-modeler-element-template-chooser",
    "@miragon/bpmn-modeler-append-menu",
    "@miragon/bpmn-model-navigation",
    "@miragon/bpmn-modeler-code-link",
    "@miragon/bpmn-modeler-inline-scripting",
    "@miragon/bpmn-modeler-flow-navigation",
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
        failures.push(`leaked protocol symbols: ${[...new Set(contentHits)].join(", ")}`);
    }

    // Invalid-ambient guard: a function re-exported from a bundled lib can be
    // rolled up with its implementation *body* (api-extractor resolves the lib
    // via its `types: ./src/index.ts` source), producing `declare function …() {`
    // or `declare async function …` — both illegal in a `.d.ts`. Surface it
    // here rather than only when a downstream `tsc` chokes on the published file.
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
        // Match only as a real module specifier — single/double quoted, never a
        // backtick (JSDoc wraps `@miragon/...` prose mentions in backticks, and
        // d.ts import specifiers are never template literals).
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
