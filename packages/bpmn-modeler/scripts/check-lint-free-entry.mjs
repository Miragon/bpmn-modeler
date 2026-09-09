// Linting is injected by consumers; the root entry must not statically pull in its stack.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const ROOT_ENTRY = resolve(distDir, "index.js");
const FORBIDDEN = /bpmnlint/;

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
