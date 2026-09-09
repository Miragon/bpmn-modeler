// Consumers cannot resolve private workspace imports or our local dmn-js ambient types.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const ENTRY_DTS = ["index.d.ts"];

const FORBIDDEN_CONTENT =
    /\bHostApi\b|\bQuery\b|\bCommand\b|@miragon\/bpmn-modeler-shared|@miragon\/bpmn-modeler-core|\bfrom\s+["']dmn-js/g;

// The diff package is reachable transitively through the modeler-types barrel.
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

    // Declaration rollup can incorrectly retain implementation bodies on re-exports.
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
