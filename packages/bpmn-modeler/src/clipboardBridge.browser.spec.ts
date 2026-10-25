import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";

import { createModeler } from "./createModeler";
import type { BpmnModeler } from "./modeler";
import { START_EVENT_XML } from "./__fixtures__/bpmnXml";
import { mountWithPanel, removeMounts, trackDocumentListeners } from "./__fixtures__/surfaceMount";

/**
 * Two-instance element clipboard through the host bridge: copy in one modeler,
 * paste in another sharing the same {@link ClipboardBridge} — the sandboxed-
 * webview round trip the bridge exists for. The async bridge re-entry only
 * exercises real bpmn-js copy/paste rules, so it runs in the browser project
 * (see docs/adr/engineering-practices.md#test-environments). The wire format
 * stays covered by `libs/bpmn-clipboard/src/BridgedClipboardModule.spec.ts`.
 */

interface CopyPasteService {
    copy(elements: unknown[]): unknown;
    paste(context?: { element?: unknown; point?: { x: number; y: number } }): void;
}

interface ElementRegistryService {
    get(id: string): unknown;
    getGraphics(id: string): SVGElement;
    filter(matcher: (element: { type: string }) => boolean): unknown[];
}

const bridgedModelers: BpmnModeler[] = [];

function dispatchCopy(target: EventTarget): ClipboardEvent {
    const event = new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer(),
    });
    target.dispatchEvent(event);
    return event;
}

async function createBridgedModeler() {
    const hostClipboard = { text: "" };
    const { container, panel } = mountWithPanel();
    panel.style.cssText = "position:absolute;left:820px;width:300px";
    const modeler = await createModeler(container, {
        engine: "c8",
        propertiesPanel: { parent: panel },
        clipboard: {
            bridge: {
                requestClipboard: () => Promise.resolve(hostClipboard.text),
                writeClipboard: (text) => {
                    hostClipboard.text = text;
                },
            },
        },
    });
    bridgedModelers.push(modeler);
    await modeler.loadDiagram(START_EVENT_XML);
    return { modeler, panel, hostClipboard };
}

async function copyStartEventFromCanvas(modeler: BpmnModeler): Promise<number> {
    let copyEventCount = 0;
    const countCopyEvent = () => copyEventCount++;
    document.addEventListener("copy", countCopyEvent, true);
    await userEvent.click(
        modeler.getService<ElementRegistryService>("elementRegistry").getGraphics("StartEvent_1"),
    );
    await userEvent.keyboard("{Control>}c{/Control}");
    document.removeEventListener("copy", countCopyEvent, true);
    return copyEventCount;
}

function startEventCount(modeler: BpmnModeler): number {
    return modeler
        .getService<ElementRegistryService>("elementRegistry")
        .filter((element) => element.type === "bpmn:StartEvent").length;
}

afterEach(() => {
    bridgedModelers.splice(0).forEach((modeler) => modeler.destroy());
    removeMounts();
});

describe("bridged clipboard across two modeler instances", () => {
    it("copies in one instance, pastes in the other, and destroys clean", async () => {
        const tracker = trackDocumentListeners("copy");
        let clipboardText = "";
        const bridge: ClipboardBridge = {
            requestClipboard: () => Promise.resolve(clipboardText),
            writeClipboard: (text) => {
                clipboardText = text;
            },
        };

        const mountA = mountWithPanel();
        const mountB = mountWithPanel();
        const modelerA = await createModeler(mountA.container, {
            engine: "c8",
            propertiesPanel: { parent: mountA.panel },
            clipboard: { bridge },
        });
        const modelerB = await createModeler(mountB.container, {
            engine: "c8",
            propertiesPanel: { parent: mountB.panel },
            clipboard: { bridge },
        });
        await modelerA.loadDiagram(START_EVENT_XML);
        await modelerB.loadDiagram(START_EVENT_XML);

        const registryA = modelerA.getService<ElementRegistryService>("elementRegistry");
        modelerA.getService<CopyPasteService>("copyPaste").copy([registryA.get("StartEvent_1")]);
        expect(clipboardText).toContain("bpmn-js-clip----");

        // `element` + `point` takes diagram-js's non-mouse paste branch; the
        // bridge interceptor re-enters asynchronously with the deserialized tree.
        modelerB.getService<CopyPasteService>("copyPaste").paste({
            element: modelerB.getService("canvas").getRootElement(),
            point: { x: 400, y: 300 },
        });

        await vi.waitFor(() => {
            expect(startEventCount(modelerB)).toBe(2);
        });
        expect(startEventCount(modelerA)).toBe(1);

        modelerA.destroy();
        modelerB.destroy();

        const { added, removed } = tracker.counts();
        tracker.restore();
        expect(added).toBeGreaterThanOrEqual(2);
        expect(removed).toBe(added);
    });
});

// Only a real canvas tracks focus and swallows the Cmd+C keydown as hosts see it.
describe("bridged clipboard copy event against a real canvas", () => {
    it("lets a later copy of static panel text through after a canvas copy that fired no copy event", async () => {
        const { modeler, panel, hostClipboard } = await createBridgedModeler();

        const copyEventsDuringCanvasCopy = await copyStartEventFromCanvas(modeler);
        const note = document.createElement("p");
        note.textContent = "Documentation";
        panel.append(note);
        await userEvent.click(note);
        const textCopy = dispatchCopy(note);

        expect(copyEventsDuringCanvasCopy).toBe(0);
        expect(hostClipboard.text).toContain("bpmn-js-clip----");
        expect(textCopy.defaultPrevented).toBe(false);
        expect(textCopy.clipboardData?.getData("text/plain")).toBe("");
    });

    it("puts the canvas copy on the clipboard while a text selection lingers in a panel field", async () => {
        const { modeler, panel } = await createBridgedModeler();
        const nameField = document.createElement("input");
        nameField.value = "Order received";
        panel.append(nameField);
        nameField.select();

        await copyStartEventFromCanvas(modeler);
        const canvasCopy = dispatchCopy(nameField);

        expect(canvasCopy.defaultPrevented).toBe(true);
        expect(canvasCopy.clipboardData?.getData("text/plain")).toContain("bpmn-js-clip----");
    });
});
