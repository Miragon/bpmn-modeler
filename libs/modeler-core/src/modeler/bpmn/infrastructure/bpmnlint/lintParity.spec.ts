import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { Engine, LintResults } from "@miragon/bpmn-modeler-types";

import { DefaultBpmnlintConfigService } from "../../service/DefaultBpmnlintConfigService";
import { NodeBpmnLinter } from "./NodeBpmnLinter";
// Cross-package relative import (spec-only): the in-page linter lives in the
// bpmn-webview app. modeler-core vitest runs in node and inlines the rules
// plugin, so BrowserLinter runs here exactly as it does in the browser bundle.
import { BrowserLinter } from "../../../../../../../apps/bpmn-webview/src/app/bpmnlint/browserLinter";

/**
 * AC5 parity: the host-side {@link NodeBpmnLinter} default run and the webview's
 * in-page {@link BrowserLinter} default run must produce byte-identical findings
 * for the same diagram. Phase B moves the no-config path in-page for hosted
 * sessions, so this is the contract that a user sees the *same* lint whether the
 * host ran it (workspace config) or the webview did (no config).
 *
 * Both sides lint the same moddle tree with the same engine-aware default config
 * (`getDefaultLintConfig({ engine, preset: "modeling" })`) and must report no
 * unresolved rules — a non-empty `unresolved` on the browser side would be a real
 * `browserResolver` bug, not a test artefact, so it is asserted, never assumed.
 */

// A C7 diagram with a task but no start/end event (so recommended rules fire) and
// a DI shape far from the modeler default (200×200) so the miragon `standard-size`
// layer also fires — proving parity across both rule layers.
const BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.20.0">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" name="Do the thing" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="160" y="80" width="200" height="200" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const PLATFORM: Engine = "c7";

/** Parses XML into the moddle root the way bpmn-js hands it to `Linting.lint`. */
async function parseModdleRoot(
    xml: string,
    moddleExtensions: Record<string, unknown> | undefined,
): Promise<unknown> {
    const mod = (await import("bpmn-moddle")) as unknown as {
        default?: (ext?: Record<string, unknown>) => {
            fromXML: (x: string) => Promise<{ rootElement: unknown }>;
        };
        BpmnModdle?: (ext?: Record<string, unknown>) => {
            fromXML: (x: string) => Promise<{ rootElement: unknown }>;
        };
    };
    const factory = mod.default ?? mod.BpmnModdle;
    if (typeof factory !== "function") {
        throw new Error("bpmn-moddle did not expose a factory.");
    }
    const { rootElement } = await factory(moddleExtensions ?? {}).fromXML(xml);
    return rootElement;
}

describe("bpmnlint default parity: NodeBpmnLinter vs BrowserLinter", () => {
    it("produces identical findings and no unresolved rules on either side", async () => {
        const config = await new DefaultBpmnlintConfigService().build(PLATFORM);

        // Host side: NodeBpmnLinter parses + lints the XML itself. The anchor is a
        // resolution root only — the default references no workspace modules.
        const anchor = resolve(__dirname, ".bpmnlintrc");
        const nodeOut = await new NodeBpmnLinter().lint(BPMN_XML, anchor, config);

        // Webview side: BrowserLinter lints the live moddle tree, so parse it here
        // with the same embedded moddle extensions the default config carries.
        const root = await parseModdleRoot(
            BPMN_XML,
            config.moddleExtensions as Record<string, unknown> | undefined,
        );
        const browserOut = await new BrowserLinter(PLATFORM).run(root);

        // The oversized task must actually trip a rule, else "parity" is vacuous.
        expect(Object.keys(nodeOut.results)).toContain("standard-size");

        expect(browserOut.results as LintResults).toEqual(nodeOut.results);
        expect(nodeOut.unresolved).toEqual([]);
        expect(browserOut.unresolved).toEqual([]);
    });
});
