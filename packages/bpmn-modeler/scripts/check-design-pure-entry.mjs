// Single-file bundlers include reachable imports, so the design graph must exclude engine and lint stacks.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const ROOT_ENTRY = resolve(distDir, "design.js");

const FORBIDDEN_PREFIXES = [
    "camunda-bpmn-js",
    "camunda-bpmn-moddle",
    "zeebe-bpmn-moddle",
    "camunda-bpmn-js-behaviors",
    "camunda-transaction-boundaries",
    "bpmn-js-element-templates",
    "@miragon/create-append-c7",
    "minisearch",
    "bpmnlint",
    "bpmn-js-bpmnlint",
    "@miragon/bpmnlint-plugin-rules",
];

// Catch lint code that was inlined instead of left as an external import.
const FORBIDDEN_CONTENT = /bpmnlint/;

function isForbidden(spec) {
    return FORBIDDEN_PREFIXES.some((prefix) => spec === prefix || spec.startsWith(`${prefix}/`));
}

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
    console.error(`check-design-pure-entry: ${message}`);
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
        `the design entry statically reaches the Camunda/lint stack — the ` +
            `/design subpath must stay engine-neutral:\n  ${[...new Set(offenders)].join("\n  ")}`,
    );
}

console.log(
    `check-design-pure-entry: dist/design.js and its ${visited.size - 1} static chunks are Camunda-free.`,
);
