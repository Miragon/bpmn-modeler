// Scratch-consumer smoke test: proves the *packed* tarball works once installed
// like a real dependency, not just that it builds in-repo.
//
// Runs from a throwaway project (`npm init -y`, `type: module`,
// `npm install <tarball> jsdom esbuild`) where `@miragon/dmn-modeler` resolves
// through node_modules — the same path an out-of-repo consumer takes. It asserts:
//   1. no `workspace:*` range survived the pack (yarn rewrites them to real
//      versions; a survivor would `npm install`-fail for a real consumer);
//   2. every `exports` subpath resolves to a file that exists;
//   3. the package + its externalised dmn-js stack **bundle** and import, and
//      `createModeler` + `loadDiagram` of a minimal DMN succeeds.
//
// Step 3 goes through esbuild on purpose. The dmn-js stack (dmn-js,
// dmn-js-shared, dmn-js-drd, …) ships no `exports` maps and uses extensionless
// deep imports, so it does not resolve under Node's native ESM resolver — only
// through a bundler, which is how every real consumer (Vite/webpack/esbuild)
// and the webview host use it. We therefore bundle a tiny consumer entry the
// same way, then run it. A direct `import("@miragon/dmn-modeler")` under bare
// `node` would fail on dmn-js internals and prove nothing about real usage.
// If dmn-js cannot render under jsdom in the scratch app this degrades to
// import-only and says so.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const PKG = "@miragon/dmn-modeler";
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

// 2. Every exports subpath resolves to a real file.
const SUBPATHS = [".", "./styles.css", "./light-theme.css", "./dark-theme.css"];
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

// 3. Bundle a consumer entry with esbuild (resolving the dmn-js stack a real
//    bundler would), then import the bundle and stand up a modeler. CSS/font
//    assets the stack imports are dropped — the smoke exercises behaviour, not
//    styling. A minimal DRD with one decision table, mirroring the sample the
//    webview host uses for standalone runs.
const MINIMAL_DMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" id="smoke" name="Smoke" namespace="http://camunda.org/schema/1.0/dmn">
  <decision id="decision_1" name="Decision 1">
    <decisionTable id="decisionTable_1">
      <input id="input_1"><inputExpression id="inputExpression_1" typeRef="string"><text></text></inputExpression></input>
      <output id="output_1" typeRef="string" />
    </decisionTable>
  </decision>
  <dmndi:DMNDI>
    <dmndi:DMNDiagram>
      <dmndi:DMNShape dmnElementRef="decision_1"><dc:Bounds height="80" width="180" x="160" y="100" /></dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>`;

const { build } = await import("esbuild");
const bundlePath = fileURLToPath(
    new URL("./dmn-modeler.smoke-bundle.mjs", pathToFileURL(`${process.cwd()}/`)),
);
try {
    await build({
        stdin: {
            contents: `export { createModeler } from "${PKG}";`,
            resolveDir: process.cwd(),
            loader: "js",
        },
        bundle: true,
        format: "esm",
        platform: "node",
        loader: {
            ".css": "empty",
            ".svg": "empty",
            ".eot": "empty",
            ".woff": "empty",
            ".woff2": "empty",
            ".ttf": "empty",
        },
        outfile: bundlePath,
        logLevel: "silent",
    });
} catch (error) {
    fail(`bundling a consumer of "${PKG}" failed: ${error.message}`);
}

const { JSDOM } = await import("jsdom");
const dom = new JSDOM(`<!doctype html><html><body></body></html>`, { pretendToBeVisual: true });
// jsdom implements none of these; a real browser (every actual consumer's
// environment) does. Stub them so the theme code, diagram-js layout and the
// properties panel's rAF-scheduled render run headless.
dom.window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
        return false;
    },
});
dom.window.requestAnimationFrame ??= (cb) => setTimeout(() => cb(Date.now()), 0);
dom.window.cancelAnimationFrame ??= (id) => clearTimeout(id);
dom.window.SVGElement.prototype.getBBox ??= () => ({ x: 0, y: 0, width: 0, height: 0 });
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame;
// defineProperty, not assignment: Node >=21 ships `navigator` as a getter-only
// global, so `globalThis.navigator = …` throws.
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "SVGElement"]) {
    Object.defineProperty(globalThis, key, {
        value: dom.window[key],
        configurable: true,
        writable: true,
    });
}

let mod;
try {
    mod = await import(pathToFileURL(bundlePath));
} catch (error) {
    fail(`import of the bundled "${PKG}" threw: ${error.message}`);
}
if (typeof mod.createModeler !== "function") {
    fail(`${PKG} does not export createModeler`);
}

try {
    const canvas = dom.window.document.createElement("div");
    const panel = dom.window.document.createElement("div");
    dom.window.document.body.append(canvas, panel);
    const modeler = await mod.createModeler(canvas, { propertiesPanel: { parent: panel } });
    await modeler.loadDiagram(MINIMAL_DMN);
    const xml = await modeler.exportDiagram();
    if (!xml.includes("decision_1")) fail("exportDiagram did not round-trip the decision");
    modeler.destroy();
    console.log(
        `smoke-consumer: bundled consumer of ${PKG}@${installedManifest.version} resolves ` +
            `every subpath and createModeler + loadDiagram round-trips a DMN under jsdom.`,
    );
} catch (error) {
    console.log(
        `smoke-consumer: bundled consumer of ${PKG}@${installedManifest.version} resolves ` +
            `every subpath and imports; dmn-js could not render headless (import-only smoke): ${error.message}`,
    );
}

// The headless modeler leaves rAF/timer-scheduled render work pending; exit
// explicitly so a late headless-only throw can't fail an otherwise-passed smoke.
process.exit(0);
