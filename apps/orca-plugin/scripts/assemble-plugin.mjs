// Completes plugin/ around the editor pages and bundles Vite wrote there, and fails when Orca would refuse
// or warn about it.
import { cp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plugin = join(app, "plugin");

const MAX_PLUGIN_BYTES = 50 * 1024 * 1024;
const MAX_PLUGIN_FILES = 2000;
const MAX_SCRIPT_BYTES = 10 * 1024 * 1024;
// The pattern of Orca's `plugin check` (editor_eval), which the smoke test treats as a failure.
const ORCA_EVAL = /(?<![\w$.])(?:eval|Function)\s*\(|\bnew\s+Function\b/;
// Orca's plugin directory refuses every other binary file, such as EOT or TTF fonts.
const LISTED_BINARIES = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".woff", ".woff2"]);

const manifest = JSON.parse(await readFile(join(app, "orca-plugin.json"), "utf8"));
await writeFile(join(plugin, "orca-plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await cp(join(app, "assets"), join(plugin, "assets"), { recursive: true });
await cp(join(app, "images"), join(plugin, "images"), { recursive: true });
await cp(join(app, "templates"), join(plugin, "templates"), { recursive: true });
await cp(join(app, "CHANGELOG.md"), join(plugin, "CHANGELOG.md")).catch(() => undefined);

async function filesUnder(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
        entries.map((entry) => {
            const path = join(directory, entry.name);
            return entry.isDirectory() ? filesUnder(path) : [path];
        }),
    );
    return nested.flat();
}

const problems = [];
const files = await filesUnder(plugin);
let total = 0;
for (const file of files) {
    const { size } = await stat(file);
    total += size;
    const name = relative(plugin, file);
    const isBinary = (await readFile(file)).includes(0);
    if (isBinary && !LISTED_BINARIES.has(extname(file).toLowerCase())) {
        problems.push(`${name} is a binary file Orca's directory does not list`);
    }
    if (!file.endsWith(".js")) continue;
    if (size > MAX_SCRIPT_BYTES) problems.push(`${name} has ${size} bytes, more than a script may`);
    const line = (await readFile(file, "utf8"))
        .split("\n")
        .findIndex((text) => ORCA_EVAL.test(text));
    if (line !== -1) problems.push(`${name}:${line + 1} calls eval or Function`);
}
if (files.length > MAX_PLUGIN_FILES) problems.push(`${files.length} files, more than a plugin may`);
if (total > MAX_PLUGIN_BYTES) problems.push(`${total} bytes, more than a plugin may`);
if (problems.length > 0) {
    console.error(problems.map((problem) => `✗ ${problem}`).join("\n"));
    process.exit(1);
}
console.log(
    `[orca-plugin] ${files.length} files, ${(total / 1024 / 1024).toFixed(1)} MiB in ${plugin}`,
);
