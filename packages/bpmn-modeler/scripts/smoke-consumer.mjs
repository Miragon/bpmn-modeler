// Scratch-consumer smoke test (issue #1379): proves the *packed* tarball works
// once installed like a real dependency, not just that it builds in-repo.
//
// Runs from a throwaway project (`npm init -y`, `type: module`,
// `npm install <tarball>`) where `@miragon/bpmn-modeler` resolves through
// node_modules — the same path an out-of-repo consumer takes. It asserts:
//   1. no `workspace:*` range survived the pack (yarn rewrites them to real
//      versions; a survivor would `npm install`-fail for a real consumer);
//   2. every `exports` subpath resolves to a file that exists (the root entry
//      is resolved, never executed — it touches the DOM);
//   3. representative browser consumers bundle without aliases or externals;
//   4. the Node-safe `./diff` subpath actually runs end to end.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build, version as esbuildVersion } from "esbuild";

const PKG = "@miragon/bpmn-modeler";
const require = createRequire(import.meta.url);

function fail(message) {
    console.error(`smoke-consumer: ${message}`);
    process.exit(1);
}

// 1. No workspace: range survived the pack.
const installedManifest = require(`${PKG}/package.json`);
for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
]) {
    for (const [name, range] of Object.entries(installedManifest[field] ?? {})) {
        if (typeof range === "string" && range.startsWith("workspace:")) {
            fail(`installed manifest still carries a workspace range: ${field}.${name} = ${range}`);
        }
    }
}

// 2. Every exports subpath resolves to a real file. The root entry is
//    DOM-touching, so we resolve it (proves the mapping + file) but never import it.
const SUBPATHS = [
    ".",
    "./diff",
    "./lint",
    "./viewer",
    "./design",
    "./mode",
    "./styles.css",
    "./viewer.css",
    "./design.css",
    "./mode.css",
    "./light-theme.css",
    "./dark-theme.css",
];
for (const subpath of SUBPATHS) {
    const specifier = subpath === "." ? PKG : `${PKG}/${subpath.slice(2)}`;
    let resolved;
    try {
        resolved = import.meta.resolve(specifier);
    } catch (error) {
        fail(`exports subpath ${subpath} did not resolve: ${error.message}`);
    }
    if (!existsSync(fileURLToPath(resolved))) {
        fail(`exports subpath ${subpath} resolved to a missing file: ${resolved}`);
    }
}

// 3. Bundle browser consumers without running their DOM-touching code in Node.
// Factory calls are intentionally retained: each fixture exercises the actual
// dependency closure for that public surface and option shape.
if (esbuildVersion !== "0.28.2") {
    fail(`expected esbuild 0.28.2, found ${esbuildVersion}`);
}

const BROWSER_FIXTURES = {
    "modeler-c7": `
        import "@miragon/bpmn-modeler/styles.css";
        import { createModeler } from "@miragon/bpmn-modeler";
        const canvas = document.querySelector("#canvas");
        const panel = document.querySelector("#panel");
        void createModeler(canvas, { engine: "c7", propertiesPanel: { parent: panel }, linting: false });
    `,
    "modeler-c8": `
        import "@miragon/bpmn-modeler/styles.css";
        import { createModeler } from "@miragon/bpmn-modeler";
        const canvas = document.querySelector("#canvas");
        const panel = document.querySelector("#panel");
        void createModeler(canvas, { engine: "c8", propertiesPanel: { parent: panel }, linting: false });
    `,
    "design": `
        import "@miragon/bpmn-modeler/design.css";
        import { createDesigner } from "@miragon/bpmn-modeler/design";
        const canvas = document.querySelector("#canvas");
        const panel = document.querySelector("#panel");
        void createDesigner(canvas, { propertiesPanel: { parent: panel }, linting: false });
    `,
    "viewer-with-panel": `
        import "@miragon/bpmn-modeler/viewer.css";
        import { createViewer } from "@miragon/bpmn-modeler/viewer";
        const canvas = document.querySelector("#canvas");
        const panel = document.querySelector("#panel");
        void createViewer(canvas, { propertiesPanel: { parent: panel } });
    `,
    "viewer-without-panel": `
        import "@miragon/bpmn-modeler/viewer.css";
        import { createViewer } from "@miragon/bpmn-modeler/viewer";
        const canvas = document.querySelector("#canvas");
        void createViewer(canvas);
    `,
};

for (const [name, contents] of Object.entries(BROWSER_FIXTURES)) {
    try {
        await build({
            stdin: { contents, loader: "js", resolveDir: process.cwd(), sourcefile: `${name}.js` },
            bundle: true,
            platform: "browser",
            format: "esm",
            target: "es2021",
            treeShaking: false,
            write: false,
            logLevel: "silent",
            loader: {
                ".css": "empty",
                ".less": "empty",
                ".sass": "empty",
                ".scss": "empty",
            },
        });
    } catch (error) {
        fail(`browser fixture ${name} did not bundle: ${error.message}`);
    }
}

// 4. The Node-safe ./diff subpath runs. Fixtures mirror scripts/check-diff-node.mjs.
const { computeDiff, sideView } = await import(`${PKG}/diff`);

const BEFORE = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

const AFTER = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Task_1" />
  </bpmn:process>
</bpmn:definitions>`;

const result = await computeDiff(BEFORE, AFTER);
if (!result.added.includes("Task_1")) fail("expected the added Task_1 in computeDiff result.added");
const after = sideView(result, "after");
if (!after.added.includes("Task_1")) fail("sideView(after).added should carry Task_1");

console.log(
    `smoke-consumer: installed ${PKG}@${installedManifest.version} resolves every subpath, bundles ${Object.keys(BROWSER_FIXTURES).length} browser consumers, and ./diff runs.`,
);
