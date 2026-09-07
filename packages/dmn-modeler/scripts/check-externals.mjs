// Externals gate: every bare specifier the built bundle imports must be a
// declared `dependencies` key. The Vite lib build externalises the whole dmn-js
// stack (only the two private libs are inlined), so a bare import that is not a
// declared dependency is a leak a real installer cannot resolve — either an
// un-inlined private workspace lib or an undeclared transitive external. This
// mechanises the JS side of the "no leaked private lib / undeclared external"
// property (`check-dts.mjs` covers the types side).
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(pkgRoot, "dist");
const manifest = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
const declared = new Set(Object.keys(manifest.dependencies ?? {}));

// import/export … from "x"; bare `import "x"`; dynamic import("x"); require("x").
const SPECIFIER_PATTERNS = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']/g,
];

/** The installable package name of a bare specifier (`@scope/name/sub` → `@scope/name`). */
function packageName(spec) {
    const parts = spec.split("/");
    return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function collectJsFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...collectJsFiles(abs));
        else if (entry.name.endsWith(".js")) out.push(abs);
    }
    return out;
}

const jsFiles = collectJsFiles(distDir);
if (jsFiles.length === 0) {
    console.error(`check-externals: no .js found in ${distDir} — run the lib build first.`);
    process.exit(1);
}

const undeclared = new Map(); // package name → set of files
for (const file of jsFiles) {
    const code = readFileSync(file, "utf8");
    for (const pattern of SPECIFIER_PATTERNS) {
        for (const match of code.matchAll(pattern)) {
            const spec = match[1];
            // Relatives, absolutes, and Node builtins never come from dependencies.
            if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:")) continue;
            const name = packageName(spec);
            if (!declared.has(name)) {
                if (!undeclared.has(name)) undeclared.set(name, new Set());
                undeclared.get(name).add(file.slice(distDir.length + 1));
            }
        }
    }
}

if (undeclared.size > 0) {
    const lines = [...undeclared.entries()].map(
        ([name, files]) => `  ${name}  (in ${[...files].join(", ")})`,
    );
    console.error(
        "check-externals: bundle imports bare specifiers not declared in " +
            "`dependencies`:\n" +
            lines.join("\n") +
            "\nDeclare them as real dependencies, or inline the private lib " +
            "(INLINED_LIBS in vite.config.mts).",
    );
    process.exit(1);
}

console.log(`check-externals: every bare import in dist/ is a declared dependency.`);
