import Modeler from "bpmn-js/lib/Modeler";
import bpmnLintingModule from "bpmn-js-bpmnlint";
import type { ModuleDeclaration } from "didi";
import type EventBus from "diagram-js/lib/core/EventBus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDirectEditingContent } from "@miragon/bpmn-modeler-clipboard";
import { getPopupMenuContext } from "@miragon/bpmn-modeler-append-menu";

import { LintingInternals } from "./bpmnlint/lintingInternals";
import { mountCanvas, removeMounts } from "./__fixtures__/surfaceMount";

/**
 * Pins the private upstream shapes the typed adapters (WP1) reach into against
 * the *installed* bpmn-js / diagram-js / bpmn-js-bpmnlint — so a renovate bump
 * that moves `directEditing._textbox.content`, `popupMenu._getContext`, the
 * `linting` overlay bookkeeping or the `saveXML` result contract fails here
 * loudly rather than silently no-op'ing in production. Runs against real
 * Chromium because direct editing and the popup menu need layout and focus
 * jsdom lacks.
 */

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" name="A" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="200" y="200" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

let modeler: Modeler | undefined;

beforeEach(async () => {
    modeler = new Modeler({
        container: mountCanvas(),
        additionalModules: [bpmnLintingModule as ModuleDeclaration],
    });
    await modeler.importXML(XML);
});

afterEach(() => {
    modeler?.destroy();
    modeler = undefined;
    removeMounts();
});

function task(): unknown {
    return modeler!.get<{ get(id: string): unknown }>("elementRegistry").get("Task_1");
}

describe("getDirectEditingContent (diagram-js-direct-editing shape pin)", () => {
    it("returns the contenteditable overlay for the active editing session", () => {
        const directEditing = modeler!.get<{ activate(element: unknown): void }>("directEditing");
        directEditing.activate(task());

        const content = getDirectEditingContent(directEditing);

        expect(content).toBeInstanceOf(HTMLElement);
        expect(content.isContentEditable).toBe(true);
    });

    it.each([
        ["no textbox", {}],
        ["empty textbox", { _textbox: {} }],
    ])("throws when the shape is unexpected (%s)", (_label, value) => {
        expect(() => getDirectEditingContent(value)).toThrow(/diagram-js-direct-editing/);
    });
});

describe("getPopupMenuContext (diagram-js popupMenu shape pin)", () => {
    it("collects entries for the bpmn-replace provider", () => {
        const popupMenu = modeler!.get("popupMenu");

        const context = getPopupMenuContext(popupMenu, task(), "bpmn-replace");

        expect(Object.keys(context.entries).length).toBeGreaterThan(0);
        expect(typeof context.headerEntries).toBe("object");
        expect(context.empty).toBe(false);
    });

    it("throws when popupMenu carries no _getContext", () => {
        expect(() => getPopupMenuContext({}, task(), "bpmn-replace")).toThrow(
            /diagram-js popupMenu/,
        );
    });
});

describe("LintingInternals (bpmn-js-bpmnlint linting shape pin)", () => {
    it("tracks the overlay the vendor creates for an element's issues", () => {
        const linting = new LintingInternals(modeler!.get("linting"));
        const issues = linting.formatIssues({
            "label-required": [{ id: "Task_1", message: "Missing label", category: "warn" }],
        });

        linting.createElementOverlays("Task_1", issues.Task_1);

        const overlayId = linting.overlayIdOf("Task_1");
        expect(overlayId).toBeDefined();
        expect(modeler!.get<{ get(id: string): unknown }>("overlays").get(overlayId!)).toBeTruthy();

        linting.clearOverlays();
        expect(linting.overlayIdOf("Task_1")).toBeUndefined();
    });

    it("throws when linting lacks its private members", () => {
        expect(
            () => new LintingInternals({ lint: vi.fn(), update: vi.fn(), isActive: vi.fn() }),
        ).toThrow(/bpmn-js-bpmnlint linting/);
    });
});

describe("saveXML (bpmn-js export contract pin)", () => {
    it("resolves with the XML, preamble included", async () => {
        const { xml } = await modeler!.saveXML({ format: true });

        expect(xml).toMatch(/^<\?xml /);
    });

    it("rejects with a serialisation failure instead of resolving it as { error }", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const failure = new Error("serialisation failed");
        modeler!.get<EventBus>("eventBus").once("saveXML.serialized", () => {
            throw failure;
        });

        await expect(modeler!.saveXML({ format: true })).rejects.toBe(failure);
        consoleError.mockRestore();
    });
});
