// Acceptance-criterion 3 (issue #1376), mechanised: the published type surface
// must not leak the private webview↔host protocol. Fails the build if a
// rolled-up entry `.d.ts` names a protocol symbol (`HostApi`/`Query`/
// `Command`), references `@miragon/bpmn-modeler-shared`, or imports any private
// workspace lib name (those are inlined, so a surviving import means the d.ts
// roll-up leaked an un-bundled dependency the consumer cannot install).
//
// All public entries are checked — the root `dist/index.d.ts`, the
// `dist/diff.d.ts` data-layer subpath (#1378), the `dist/lint.d.ts`
// injectable-lint subpath (#1407), and the surface subpaths.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ENTRY_DTS = [
    "index.d.ts",
    "diff.d.ts",
    "lint.d.ts",
    "viewer.d.ts",
    "design.d.ts",
    "mode.d.ts",
];

// Whole-word protocol type names + the private protocol package. The word gate
// also covers public diff jsdoc: a bare `Query`/`Command`/`HostApi` in a
// comment would trip it (d.ts jsdoc survives the roll-up).
const FORBIDDEN_CONTENT =
    /\bHostApi\b|\bQuery\b|\bCommand\b|@miragon\/bpmn-modeler-shared|@miragon\/bpmn-modeler-core/g;

export function checkDts({
    packageRoot = PACKAGE_ROOT,
    distDir = resolve(packageRoot, "dist"),
    configPath = resolve(packageRoot, "inlined-libraries.json"),
    entries = ENTRY_DTS,
} = {}) {
    // Every inlined workspace lib is a private name — none may survive as an
    // import in the flattened d.ts. Deriving the list from the build config
    // keeps this gate from drifting when a lib is added (the hand-kept list
    // missed `@miragon/bpmn-modeler-layout`). The public npm `@miragon/*`
    // packages (`-i18n`, `bpmnlint-plugin-rules`, `create-append-c7`) are not
    // in the config and stay allowed.
    const privateLibs = JSON.parse(readFileSync(configPath, "utf8")).map((library) => library.name);

    for (const entry of entries) {
        checkEntry(distDir, entry, privateLibs);
    }

    return { checkedEntries: entries.length, privateLibs: privateLibs.length };
}

function checkEntry(distDir, fileName, privateLibs) {
    const dtsPath = resolve(distDir, fileName);
    let dts;
    try {
        dts = readFileSync(dtsPath, "utf8");
    } catch {
        throw new Error(`${dtsPath} not found — run the lib build first.`);
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

    for (const lib of privateLibs) {
        // Match only as a real module specifier — single/double quoted, never a
        // backtick (JSDoc wraps `@miragon/...` prose mentions in backticks, and
        // d.ts import specifiers are never template literals).
        const escaped = lib.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
        if (new RegExp(`["']${escaped}(/[^"']*)?["']`).test(dts)) {
            failures.push(`leaked private-lib import: ${lib}`);
        }
    }

    if (failures.length > 0) {
        throw new Error(`dist/${fileName} leaks private surface:\n  ` + failures.join("\n  "));
    }
}

function isMain() {
    return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
    try {
        const { checkedEntries, privateLibs } = checkDts();
        console.log(
            `check-dts: ${checkedEntries} entries are clean against ${privateLibs} private libs.`,
        );
    } catch (error) {
        console.error(`check-dts: ${error.message}`);
        process.exitCode = 1;
    }
}
