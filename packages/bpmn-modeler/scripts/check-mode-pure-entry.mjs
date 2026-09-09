// Keep injected surface dependencies out of the mode entry, including its emitted chunks.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const ROOT_ENTRY = resolve(distDir, "mode.js");

function isForbidden(spec) {
    return (
        spec === "bpmn-js" ||
        spec.startsWith("bpmn-js/") ||
        spec.startsWith("bpmn-js-") ||
        spec === "diagram-js" ||
        spec.startsWith("diagram-js/") ||
        spec.startsWith("diagram-js-") ||
        spec.startsWith("camunda") ||
        spec.startsWith("zeebe-") ||
        spec === "bpmnlint" ||
        spec.startsWith("bpmnlint/") ||
        spec.startsWith("@bpmn-io/") ||
        spec === "@miragon/bpmn-modeler-properties-panel" ||
        spec.startsWith("@miragon/bpmn-modeler-properties-panel/")
    );
}

// Catch lint code that was inlined instead of left as an external import.
const FORBIDDEN_CONTENT = /bpmnlint/;

// This scan covers static imports and re-exports only; dynamic imports are excluded.
const STATIC_SPECIFIER_PATTERNS = [
    /\bimport\s+[^;'"]*?\bfrom\s*["']([^"']+)["']/g,
    /\bexport\s+[^;'"]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
];

function staticSpecifiers(code) {
    return STATIC_SPECIFIER_PATTERNS.flatMap((pattern) =>
        [...code.matchAll(pattern)].map((match) => match[1]),
    );
}

function fail(message) {
    console.error(`check-mode-pure-entry: ${message}`);
    process.exit(1);
}

if (!existsSync(ROOT_ENTRY)) {
    fail(`${ROOT_ENTRY} not found — run the lib build first.`);
}

const visited = new Set();
const offenders = [];
const queue = [ROOT_ENTRY];

while (queue.length > 0) {
    const file = queue.pop();
    if (visited.has(file)) continue;
    visited.add(file);

    const code = readFileSync(file, "utf8");
    if (FORBIDDEN_CONTENT.test(code)) {
        offenders.push(`${relative(distDir, file)} → inlined lint stack`);
    }

    for (const spec of staticSpecifiers(code)) {
        if (spec.startsWith(".")) {
            const resolved = resolve(dirname(file), spec);
            if (existsSync(resolved)) queue.push(resolved);
            continue;
        }
        if (isForbidden(spec)) {
            offenders.push(`${relative(distDir, file)} → ${spec}`);
        }
    }
}

if (offenders.length > 0) {
    fail(
        `the mode entry statically reaches the bpmn-js / Camunda / lint stack — the ` +
            `/mode subpath must inject its surfaces, never import them:\n  ${[...new Set(offenders)].join("\n  ")}`,
    );
}

console.log(
    `check-mode-pure-entry: dist/mode.js and its ${visited.size - 1} static chunks are surface-free.`,
);
