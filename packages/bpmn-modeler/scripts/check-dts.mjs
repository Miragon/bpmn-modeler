// Acceptance-criterion 3 (issue #1376), mechanised: the published type surface
// must not leak the private webview↔host protocol. Fails the build if the
// rolled-up `dist/index.d.ts` names a protocol symbol (`HostApi`/`Query`/
// `Command`), references `@miragon/bpmn-modeler-shared`, or imports any private
// workspace lib name (those are inlined, so a surviving import means the d.ts
// roll-up leaked an un-bundled dependency the consumer cannot install).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const dtsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/index.d.ts");

let dts;
try {
    dts = readFileSync(dtsPath, "utf8");
} catch {
    console.error(`check-dts: ${dtsPath} not found — run the lib build first.`);
    process.exit(1);
}

// Whole-word protocol type names + the private protocol package.
const FORBIDDEN_CONTENT =
    /\bHostApi\b|\bQuery\b|\bCommand\b|@miragon\/bpmn-modeler-shared|@miragon\/bpmn-modeler-core/g;

// Private workspace libs are inlined at build time — none may survive as an
// import in the flattened d.ts. The public npm `@miragon/*` packages
// (`-i18n`, `bpmnlint-plugin-rules`, `create-append-c7`) are allowed.
const PRIVATE_LIBS = [
    "@miragon/bpmn-modeler-types",
    "@miragon/bpmn-modeler-clipboard",
    "@miragon/bpmn-modeler-i18n-extras",
    "@miragon/bpmn-modeler-element-template-chooser",
    "@miragon/bpmn-modeler-append-menu",
    "@miragon/bpmn-model-navigation",
    "@miragon/bpmn-modeler-code-link",
    "@miragon/bpmn-modeler-inline-scripting",
    "@miragon/bpmn-modeler-flow-navigation",
];

const failures = [];

const contentHits = [...dts.matchAll(FORBIDDEN_CONTENT)].map((m) => m[0]);
if (contentHits.length > 0) {
    failures.push(`leaked protocol symbols: ${[...new Set(contentHits)].join(", ")}`);
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
    console.error("check-dts: dist/index.d.ts leaks private surface:\n  " + failures.join("\n  "));
    process.exit(1);
}

console.log("check-dts: dist/index.d.ts is clean.");
