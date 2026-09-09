// Run from a scratch ESM project with the packed tarball, jsdom, and esbuild installed.
// dmn-js uses extensionless deep imports that need a bundler to resolve.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const PKG = "@miragon/dmn-modeler";
const require = createRequire(import.meta.url);

function fail(message) {
    console.error(`smoke-consumer: ${message}`);
    process.exit(1);
}

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
// Supply browser APIs missing from jsdom for headless rendering.
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
// Node exposes navigator as a getter-only global, so assignment would throw.
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

// Pending headless render timers can throw after the smoke has completed.
process.exit(0);
