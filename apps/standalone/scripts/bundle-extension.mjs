#!/usr/bin/env node
// Copies the freshly-built bpmn-modeler-plugin.vsix into ./plugins/ AND
// unpacks it into a directory — Theia's `local-dir:` plugin loader expects
// pre-unpacked plugins (with an `extension/package.json` at the root of each
// plugin folder), not raw .vsix zips.
//
// Run AFTER the main repo has produced the .vsix:
//   corepack yarn build
//   (cd dist/apps/modeler-plugin && npx @vscode/vsce package --out bpmn-modeler-plugin.vsix --yarn --no-dependencies)
//   corepack yarn workspace standalone bundle

import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const yauzl = require("yauzl");

const __dirname = dirname(fileURLToPath(import.meta.url));
const standaloneDir = resolve(__dirname, "..");
const repoRoot = resolve(standaloneDir, "..", "..");
const vsixSrc = resolve(
  repoRoot,
  "dist",
  "apps",
  "modeler-plugin",
  "bpmn-modeler-plugin.vsix",
);
const pluginsDir = resolve(standaloneDir, "plugins");
const pluginName = "bpmn-modeler-plugin";
const unpackedDir = resolve(pluginsDir, pluginName);

if (!existsSync(vsixSrc)) {
  console.error(`ERROR: ${vsixSrc} not found.`);
  console.error("Run the main repo build + vsce package first:");
  console.error("  corepack yarn build");
  console.error("  cd dist/apps/modeler-plugin && npx @vscode/vsce package --out bpmn-modeler-plugin.vsix --yarn --no-dependencies");
  process.exit(1);
}

if (existsSync(pluginsDir)) {
  for (const entry of readdirSync(pluginsDir)) {
    rmSync(resolve(pluginsDir, entry), { recursive: true, force: true });
  }
} else {
  mkdirSync(pluginsDir, { recursive: true });
}

mkdirSync(unpackedDir, { recursive: true });

await new Promise((resolveP, reject) => {
  yauzl.open(vsixSrc, { lazyEntries: true }, (err, zipfile) => {
    if (err) return reject(err);
    zipfile.readEntry();
    zipfile.on("entry", async (entry) => {
      const outPath = join(unpackedDir, entry.fileName);
      if (/\/$/.test(entry.fileName)) {
        await mkdir(outPath, { recursive: true });
        zipfile.readEntry();
      } else {
        await mkdir(dirname(outPath), { recursive: true });
        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr) return reject(streamErr);
          const writeStream = createWriteStream(outPath);
          readStream.pipe(writeStream);
          writeStream.on("finish", () => zipfile.readEntry());
          writeStream.on("error", reject);
        });
      }
    });
    zipfile.on("end", resolveP);
    zipfile.on("error", reject);
  });
});

console.log(`Unpacked: ${vsixSrc} -> ${unpackedDir}`);
