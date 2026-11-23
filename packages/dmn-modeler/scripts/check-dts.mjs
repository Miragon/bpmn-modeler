// Consumers cannot resolve private workspace imports or our local dmn-js ambient types.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY_DTS = ["index.d.ts"];

const FORBIDDEN_CONTENT =
    /\bHostApi\b|\bQuery\b|\bCommand\b|@miragon\/bpmn-modeler-shared|@miragon\/bpmn-modeler-core|\bfrom\s+["']dmn-js/g;

// `@internal` on a re-export does nothing; these must stay trimmed by the tag on their declaration.
const INTERNAL_DECLARATIONS = [
    "createDiffViewer",
    "DmnDiffMarks",
    "DmnDiffViewerHandle",
    "DmnDiffViewerOptions",
    "DmnDiffStatus",
    "DmnTableMarks",
];

const INTERNAL_DECLARATION = new RegExp(
    `\\bdeclare\\s+(?:function|interface|type|const|class)\\s+(${INTERNAL_DECLARATIONS.join("|")})\\b`,
    "g",
);

export function checkDts({
    distDir = resolve(PACKAGE_ROOT, "dist"),
    configPath = resolve(PACKAGE_ROOT, "inlined-libraries.json"),
    entries = ENTRY_DTS,
} = {}) {
    const privateLibs = JSON.parse(readFileSync(configPath, "utf8")).map((library) => library.name);
    for (const entry of entries) {
        checkEntry(distDir, entry, privateLibs);
    }
    return { checkedEntries: entries.length };
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

    for (const lib of privateLibs) {
        const escaped = lib.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
        if (new RegExp(`["']${escaped}(/[^"']*)?["']`).test(dts)) {
            failures.push(`leaked private-lib import: ${lib}`);
        }
    }

    const internalHits = [...dts.matchAll(INTERNAL_DECLARATION)].map((m) => m[1]);
    if (internalHits.length > 0) {
        failures.push(
            `declares internal: ${[...new Set(internalHits)].join(", ")} ` +
                "(tag the declaration itself `@internal`)",
        );
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
        const { checkedEntries } = checkDts();
        console.log(`check-dts: ${checkedEntries} entries are clean.`);
    } catch (error) {
        console.error(`check-dts: ${error.message}`);
        process.exitCode = 1;
    }
}
