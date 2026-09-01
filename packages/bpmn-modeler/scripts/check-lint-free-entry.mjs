// Acceptance criterion for issue #1407, mechanised: a `linting: false` consumer
// must have no lint import in its module graph, in every bundling mode. The lint
// stack now lives behind the `@miragon/bpmn-modeler/lint` subpath and is injected
// by the host, so nothing the root entry *statically* reaches may name bpmnlint.
//
// We start at `dist/index.js` and follow only static import/export specifiers
// (never `import(...)` — a dynamic import is a separate chunk a single-file
// bundler inlines, which is the whole failure mode this replaces), collecting the
// transitive closure of chunks the root entry pulls in unconditionally. If any of
// them mentions `bpmnlint`, the lint stack leaked back into the critical path.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const ROOT_ENTRY = resolve(distDir, "index.js");
const FORBIDDEN = /bpmnlint/;

// Static specifiers only: `import … from "x"`, bare `import "x"`, and
// `export … from "x"`. `import(` (dynamic) is deliberately excluded.
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
    console.error(`check-lint-free-entry: ${message}`);
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
    if (FORBIDDEN.test(code)) {
        offenders.push(relative(distDir, file));
    }

    for (const spec of staticSpecifiers(code)) {
        if (!spec.startsWith(".")) continue; // bare externals are the consumer's problem, not ours
        const resolved = resolve(dirname(file), spec);
        if (existsSync(resolved)) queue.push(resolved);
    }
}

if (offenders.length > 0) {
    fail(
        `the root entry statically reaches the lint stack — it must stay behind ` +
            `the injectable /lint subpath:\n  ${offenders.join("\n  ")}`,
    );
}

console.log(
    `check-lint-free-entry: dist/index.js and its ${visited.size - 1} static chunks are lint-free.`,
);
