// Acceptance criterion for the `@miragon/bpmn-modeler/mode` subpath (#1447),
// mechanised: the mode-session entry orchestrates the surfaces the *consumer*
// injects, so it must value-import none of the bpmn-js / Camunda / lint stack —
// in every bundling mode. A single-file host (vite-plugin-singlefile) inlines
// everything reachable, so a bare import that survives here would land in a
// mode-only consumer's one bundle even though they never asked for the editor.
//
// The heavy stacks are Vite `external`s — they survive as *bare import
// specifiers* in dist/mode.js and its relative chunks. So we start at
// dist/mode.js, follow only relative specifiers (the emitted chunks), and fail
// if any bare specifier names a forbidden package. A content-grep for `bpmnlint`
// catches an inlined-lib leak too.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const ROOT_ENTRY = resolve(distDir, "mode.js");

// Forbidden bare specifiers — bpmn-js / diagram-js, the Camunda engine stack,
// the lint stack, the bpmn-io panel primitives, and the engine-bound properties
// panel. The consumer supplies these through the injected surface factories, so
// none may reach the mode entry's module graph.
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

// A last-line content grep (mirrors check-design-pure-entry.mjs): catches the
// lint stack even if it were inlined into a chunk rather than left external.
const FORBIDDEN_CONTENT = /bpmnlint/;

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
        `the mode entry statically reaches the bpmn-js / Camunda / lint stack — the ` +
            `/mode subpath must inject its surfaces, never import them:\n  ${[...new Set(offenders)].join("\n  ")}`,
    );
}

console.log(
    `check-mode-pure-entry: dist/mode.js and its ${visited.size - 1} static chunks are surface-free.`,
);
