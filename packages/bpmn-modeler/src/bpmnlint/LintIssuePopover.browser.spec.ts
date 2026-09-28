import "bpmn-js/dist/assets/diagram-js.css";

import Modeler from "bpmn-js/lib/Modeler";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Canvas from "diagram-js/lib/core/Canvas";
import type { ModuleDeclaration } from "didi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { LintResults } from "@miragon/bpmn-modeler-types";

import { createLintModule } from "./index";
import type { LintConfigService } from "./LintConfigService";

// At zoom 0.5, Task_Overlapped's lint icon sits inside Task_Hovered's issue list.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_Hovered" />
    <bpmn:task id="Task_Overlapped" />
    <bpmn:task id="Task_TopEdge" />
    <bpmn:task id="Task_RightEdge" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_Hovered_di" bpmnElement="Task_Hovered">
        <dc:Bounds x="600" y="600" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Overlapped_di" bpmnElement="Task_Overlapped">
        <dc:Bounds x="720" y="545" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_TopEdge_di" bpmnElement="Task_TopEdge">
        <dc:Bounds x="1000" y="20" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_RightEdge_di" bpmnElement="Task_RightEdge">
        <dc:Bounds x="1480" y="600" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

function issue(id: string, message: string) {
    return { id, message, category: "error" };
}

const RESULTS: LintResults = {
    "label-required": [
        issue("Task_Hovered", "Element is missing label/name"),
        issue("Task_Overlapped", "Element is missing label/name"),
        issue("Task_TopEdge", "Element is missing label/name"),
        issue("Task_RightEdge", "Element is missing label/name"),
    ],
    "no-disconnected": [issue("Task_Hovered", "Element is not connected")],
};

let modeler: Modeler | undefined;
let container: HTMLElement | undefined;

async function applyResults(results: LintResults): Promise<void> {
    const completed = new Promise((resolve) =>
        modeler!.get<EventBus>("eventBus").once("linting.completed", resolve),
    );
    modeler!.get<LintConfigService>("bpmnLintConfig").applyLintResults(results);
    await completed;
}

function overlayOf(elementId: string): HTMLElement {
    const overlay = container!.querySelector<HTMLElement>(
        `.djs-overlays[data-container-id="${elementId}"] .bjsl-overlay`,
    );
    if (!overlay) {
        throw new Error(`no lint overlay for ${elementId}`);
    }
    return overlay;
}

function iconOf(elementId: string): HTMLElement {
    return overlayOf(elementId).querySelector<HTMLElement>(".bjsl-icon")!;
}

function isPinned(elementId: string): boolean {
    return overlayOf(elementId).querySelector(".bjsl-dropdown")!.classList.contains("open");
}

function topmostOverlayAtCenterOf(elementId: string): string | null | undefined {
    const box = iconOf(elementId).getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    const part = hit?.closest(".bjsl-dropdown") ? "dropdown" : "icon";
    return `${part}:${hit?.closest(".djs-overlays")?.getAttribute("data-container-id")}`;
}

beforeEach(async () => {
    container = document.createElement("div");
    Object.assign(container.style, {
        position: "absolute",
        top: "0",
        left: "0",
        width: "800px",
        height: "600px",
    });
    document.body.appendChild(container);
    modeler = new Modeler({
        container,
        additionalModules: [
            createLintModule({ tier: "external", mode: "implement" }, {}) as ModuleDeclaration,
        ],
    });
    await modeler.importXML(XML);
    modeler.get<Canvas>("canvas").viewbox({ x: 0, y: 0, width: 1600, height: 1200 });
    await applyResults(RESULTS);
});

afterEach(async () => {
    await userEvent.unhover(document.body);
    modeler?.destroy();
    container?.remove();
    modeler = undefined;
    container = undefined;
});

describe("LintIssuePopover", () => {
    it("paints the hovered issue list above neighbouring lint icons below 0.7 zoom", async () => {
        expect(topmostOverlayAtCenterOf("Task_Overlapped")).toBe("icon:Task_Overlapped");

        await userEvent.hover(iconOf("Task_Hovered"));

        expect(topmostOverlayAtCenterOf("Task_Overlapped")).toBe("dropdown:Task_Hovered");
    });

    it("pins the issue list on click and keeps it open after the pointer leaves", async () => {
        await userEvent.click(iconOf("Task_Hovered"));
        await userEvent.unhover(iconOf("Task_Hovered"));

        expect(isPinned("Task_Hovered")).toBe(true);
        expect(iconOf("Task_Hovered").getAttribute("aria-expanded")).toBe("true");
        expect(topmostOverlayAtCenterOf("Task_Overlapped")).toBe("dropdown:Task_Hovered");
    });

    it("unpins on a second click, on an outside pointerdown, and when another icon is pinned", async () => {
        await userEvent.click(iconOf("Task_Hovered"));
        await userEvent.click(iconOf("Task_Hovered"));
        expect(isPinned("Task_Hovered")).toBe(false);

        await userEvent.click(iconOf("Task_Hovered"));
        await userEvent.click(iconOf("Task_RightEdge"));
        expect(isPinned("Task_Hovered")).toBe(false);
        expect(isPinned("Task_RightEdge")).toBe(true);

        await userEvent.click(container!, { position: { x: 400, y: 500 } });
        expect(isPinned("Task_RightEdge")).toBe(false);
    });

    it("unpins on Escape without letting the canvas Escape handler run", async () => {
        const documentEscape = vi.fn();
        document.addEventListener("keydown", documentEscape);
        try {
            await userEvent.click(iconOf("Task_Hovered"));
            await userEvent.keyboard("{Escape}");

            expect(isPinned("Task_Hovered")).toBe(false);
            expect(documentEscape).not.toHaveBeenCalled();
        } finally {
            document.removeEventListener("keydown", documentEscape);
        }
    });

    it("keeps the pin across a relint", async () => {
        await userEvent.click(iconOf("Task_Hovered"));

        await applyResults(RESULTS);

        expect(isPinned("Task_Hovered")).toBe(true);
    });

    it("drops the pin when the pinned element no longer has issues", async () => {
        await userEvent.click(iconOf("Task_Hovered"));

        await applyResults({ "label-required": [issue("Task_TopEdge", "Missing label")] });
        await applyResults(RESULTS);

        expect(isPinned("Task_Hovered")).toBe(false);
    });

    it("opens below near the top edge and to the left near the right edge", async () => {
        await userEvent.hover(iconOf("Task_TopEdge"));
        expect(overlayOf("Task_TopEdge").classList.contains("bjsl-issues-bottom-right")).toBe(true);

        await userEvent.hover(iconOf("Task_RightEdge"));
        expect(overlayOf("Task_RightEdge").classList.contains("lint-popover-left")).toBe(true);

        await userEvent.hover(iconOf("Task_Hovered"));
        expect(overlayOf("Task_Hovered").classList.contains("bjsl-issues-top-right")).toBe(true);
        expect(overlayOf("Task_Hovered").classList.contains("lint-popover-left")).toBe(false);
    });

    it("makes lint icons keyboard-operable buttons", async () => {
        const icon = iconOf("Task_Hovered");
        expect(icon.getAttribute("role")).toBe("button");
        expect(icon.tabIndex).toBe(0);
        expect(icon.getAttribute("aria-label")).toBe("Show lint issues");

        icon.focus();
        await userEvent.keyboard("{Enter}");
        expect(isPinned("Task_Hovered")).toBe(true);

        await userEvent.keyboard(" ");
        expect(isPinned("Task_Hovered")).toBe(false);
        expect(icon.getAttribute("aria-expanded")).toBe("false");
    });
});
