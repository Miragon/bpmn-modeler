// Acceptance criterion for issue #1196, mechanised: the engine-neutral design
// subpath (`@miragon/bpmn-modeler/design`) must stay free of the Camunda editor
// stack at the *module-graph* level — in every bundling mode. Single-file hosts
// (vite-plugin-singlefile) inline everything reachable, so a bare import that
// survives here would land in the consumer's one bundle.
//
// Unlike `/viewer`, the design surface DOES ship the engine-neutral properties
// panel — so `bpmn-js-properties-panel`, `@bpmn-io/properties-panel`, `preact`,
// CodeMirror, and `bpmn-js-create-append-anything` are all *allowed*. What must
// never appear is the Camunda engine stack (camunda-bpmn-js, the C7/C8 moddles
// and behaviours, transaction boundaries, element templates, token simulation)
// and the lint stack.
//
// The heavy stacks are Vite `external`s — they survive as *bare import
// specifiers* in dist/design.js and its relative chunks. So we start at
// dist/design.js, follow only relative specifiers (the emitted chunks), and fail
// if any bare specifier names a forbidden package. A content-grep for `bpmnlint`
// catches an inlined-lib leak too.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const ROOT_ENTRY = resolve(distDir, "design.js");

// Forbidden bare specifiers — the Camunda engine + lint stacks the design
// surface must never reach. Matched as a whole package name: `pkg` exactly or
// `pkg/<subpath>`.
const FORBIDDEN_PREFIXES = [
    "camunda-bpmn-js",
    "camunda-bpmn-moddle",
    "zeebe-bpmn-moddle",
    "camunda-bpmn-js-behaviors",
    "camunda-transaction-boundaries",
    "bpmn-js-token-simulation",
    "bpmn-js-element-templates",
    "@miragon/create-append-c7",
    "minisearch",
    "bpmnlint",
    "bpmn-js-bpmnlint",
    "@miragon/bpmnlint-plugin-rules",
];

// A last-line content grep (mirrors check-lint-free-entry.mjs): catches the lint
// stack even if it were inlined into a chunk rather than left external.
const FORBIDDEN_CONTENT = /bpmnlint/;

function isForbidden(spec) {
    return FORBIDDEN_PREFIXES.some((prefix) => spec === prefix || spec.startsWith(`${prefix}/`));
}

// Static specifiers only: `import … from "x"`, bare `import "x"`, and
// `export … from "x"`. `import(` (dynamic) is deliberately excluded — a reachable
// dynamic import is a separate chunk a single-file bundler inlines anyway, so we
// follow the static closure that decides the critical path.
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
            // Follow our own emitted chunks.
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
