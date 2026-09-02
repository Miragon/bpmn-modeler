// Acceptance criterion for issue #1405, mechanised: the readonly viewer subpath
// (`@miragon/bpmn-modeler/viewer`) must stay lean at the *module-graph* level —
// no editor stack in its static import closure, in every bundling mode. Single-
// file hosts (vite-plugin-singlefile) inline everything reachable, so a bare
// import that survives here would land in the consumer's one bundle.
//
// Unlike the lint gate (which greps chunk *contents* for an inlined lib), the
// heavy editor stacks are Vite `external`s — they survive as *bare import
// specifiers* in dist/viewer.js and its relative chunks. So we start at
// dist/viewer.js, follow only relative specifiers (the emitted chunks), and fail
// if any bare specifier names a forbidden package. The content-grep for
// `bpmnlint` is kept too, to catch an inlined-lib leak the same way the lint gate
// does.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const ROOT_ENTRY = resolve(distDir, "viewer.js");

// Forbidden bare specifiers — the editor stack the viewer must never reach.
// Matched as a whole package name: `pkg` exactly or `pkg/<subpath>`.
const FORBIDDEN_PREFIXES = [
    "camunda-bpmn-js",
    "bpmn-js-properties-panel",
    "@bpmn-io/properties-panel",
    "preact",
    "codemirror",
    "@codemirror",
    "bpmnlint",
    "bpmn-js-bpmnlint",
    "@miragon/bpmnlint-plugin-rules",
    "bpmn-js-token-simulation",
    "bpmn-js-create-append-anything",
    "camunda-transaction-boundaries",
    "minisearch",
    "@miragon/bpmn-modeler-i18n",
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
    console.error(`check-viewer-pure-entry: ${message}`);
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
        `the viewer entry statically reaches the editor stack — the /viewer ` +
            `subpath must stay lean:\n  ${[...new Set(offenders)].join("\n  ")}`,
    );
}

console.log(
    `check-viewer-pure-entry: dist/viewer.js and its ${visited.size - 1} static chunks are editor-free.`,
);
