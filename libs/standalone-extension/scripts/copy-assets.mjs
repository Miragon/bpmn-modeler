#!/usr/bin/env node
// tsc omits assets; Theia's esbuild resolves relative CSS/JSON imports from lib/.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const srcDir = resolve(root, "src");
const libDir = resolve(root, "lib");

const assets = ["styles", "themes"];
for (const asset of assets) {
    const from = resolve(srcDir, asset);
    const to = resolve(libDir, asset);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
    console.log(`copied ${from} -> ${to}`);
}
