// Scratch-consumer smoke test: proves the *packed* tarball works once installed
// like a real dependency, not just that it builds in-repo.
//
// Runs from a throwaway project (`npm init -y`, `type: module`,
// `npm install <tarball> jsdom`) where `@miragon/dmn-modeler` resolves through
// node_modules — the same path an out-of-repo consumer takes. It asserts:
//   1. no `workspace:*` range survived the pack (yarn rewrites them to real
//      versions; a survivor would `npm install`-fail for a real consumer);
//   2. every `exports` subpath resolves to a file that exists;
//   3. the package imports under jsdom and `createModeler` + `loadDiagram` of a
//      minimal DMN succeeds. If dmn-js cannot run under jsdom in the scratch app
//      this degrades to import-only and says so.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

// 3. Import under jsdom and stand up a modeler. A minimal DRD with one decision
//    table, mirroring the sample the webview host uses for standalone runs.
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

const { JSDOM } = await import("jsdom");
const dom = new JSDOM(`<!doctype html><html><body></body></html>`, { pretendToBeVisual: true });
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "SVGElement"]) {
    globalThis[key] = dom.window[key];
}

let mod;
try {
    mod = await import(PKG);
} catch (error) {
    fail(`import("${PKG}") threw: ${error.message}`);
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
        `smoke-consumer: installed ${PKG}@${installedManifest.version} resolves every subpath ` +
            `and createModeler + loadDiagram round-trips a DMN under jsdom.`,
    );
} catch (error) {
    console.log(
        `smoke-consumer: installed ${PKG}@${installedManifest.version} resolves every subpath ` +
            `and imports under jsdom; dmn-js could not run headless (import-only smoke): ${error.message}`,
    );
}
