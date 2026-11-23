// How check-vitest-targets.mjs resolves an extensionless relative import, apart
// so a spec can pin it: the script runs on import. The import graph's
// TypeScript suffixes in its order, and the .mts, .js and .mjs Vite resolves too.
export const RELATIVE_IMPORT_SUFFIXES = [
    "",
    ".ts",
    ".tsx",
    ".mts",
    ".js",
    ".mjs",
    "/index.ts",
    "/index.tsx",
];
