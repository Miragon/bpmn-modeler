import { afterEach, describe, expect, it, vi } from "vitest";

import type { MergePadDecision } from "../../domain/mergePadDecisions";

// The viewer barrel pulls in bpmn-js's whole viewer, which jsdom cannot load.
vi.mock("@miragon/bpmn-modeler/viewer", () => ({
    bpmnElementIdOf: (element: { id: string }) => element.id,
}));

import { createMergePickModule, MergePickContextPadProvider } from "./mergePickContextPad";

const ROOT = { id: "Process_1", businessObject: { id: "Process_1" } };
const TASK = { id: "Task_1", businessObject: { id: "Task_1" } };

const KEEP: MergePadDecision = { kind: "keep", scope: "element", side: "incoming" };
const KEEP_INSIDE: MergePadDecision = { kind: "keep", scope: "withContents", side: "incoming" };
const LEAVE_OUT: MergePadDecision = { kind: "leaveOut", removedBy: "current" };
const UNDO: MergePadDecision = { kind: "undo", scope: "withContents" };

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
    ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
    }) as DOMRect;

/** A pane of 1000 × 800 px at 100 %, its canvas's top left corner at the diagram's origin. */
const PANE = document.createElement("div");
PANE.getBoundingClientRect = () => rect(0, 0, 1000, 800);

function build(
    decisions: readonly MergePadDecision[],
    { open = false, selected = [TASK], drawn = [] as readonly object[] } = {},
) {
    const contextPad = {
        registerProvider: vi.fn(),
        isOpen: vi.fn(() => open),
        open: vi.fn(),
    };
    type OpenListener = (event: { current: { html: HTMLElement; target?: unknown } }) => void;
    const listeners = new Map<string, OpenListener>();
    const eventBus = {
        on: vi.fn((event: string, listener: OpenListener) => listeners.set(event, listener)),
    };
    const canvas = {
        getRootElement: () => ROOT,
        getGraphics: (element: { x: number; y: number; width: number; height: number }) => ({
            getBoundingClientRect: () => rect(element.x, element.y, element.width, element.height),
        }),
        viewbox: () => ({ x: 0, y: 0, scale: 1 }),
        getContainer: () => PANE,
    };
    const registry = { getAll: () => drawn };
    const selection = { get: () => selected };
    const translate = vi.fn((template: string) => template);
    const entryConfig = {
        decisionsOf: vi.fn((id: string) => (id === "Task_1" ? decisions : [])),
        decide: vi.fn(),
        attach: vi.fn(),
    };
    const provider = new MergePickContextPadProvider(
        contextPad,
        canvas,
        registry,
        selection,
        eventBus,
        translate,
        entryConfig,
    );
    return {
        provider,
        contextPad,
        entryConfig,
        open: (html: HTMLElement, target?: unknown) =>
            listeners.get("contextPad.open")?.({ current: { html, target } }),
    };
}

describe("MergePickContextPadProvider", () => {
    afterEach(() => {
        delete document.body.dataset.mergePadStyle;
    });

    it("registers itself with the context pad and hands itself to the merge pane", () => {
        const { provider, contextPad, entryConfig } = build([]);

        expect(contextPad.registerProvider).toHaveBeenCalledWith(provider);
        expect(entryConfig.attach).toHaveBeenCalledWith(provider);
    });

    it("reopens an open pad on the selected element, since the pad reads its entries only when it opens", () => {
        const { provider, contextPad } = build([], { open: true });

        provider.refresh();

        expect(contextPad.open).toHaveBeenCalledExactlyOnceWith(TASK, true);
    });

    it("leaves a closed pad closed", () => {
        const { provider, contextPad } = build([], { open: false });

        provider.refresh();

        expect(contextPad.open).not.toHaveBeenCalled();
    });

    it("offers the pane's decisions as worded buttons in their own group, naming the side", () => {
        const { provider } = build([KEEP, KEEP_INSIDE, LEAVE_OUT, UNDO]);

        const entries = provider.getContextPadEntries(TASK);

        expect(Object.keys(entries)).toStrictEqual([
            "merge-keep",
            "merge-keep-inside",
            "merge-leaveOut",
            "merge-undo",
        ]);
        expect(entries["merge-keep"].group).toBe("merge-pick");
        expect(entries["merge-keep"].html).toMatch(/^<button type="button" class="entry[ "]/);
        expect(entries["merge-keep"].html).toContain(">Keep incoming</span>");
        expect(entries["merge-leaveOut"].html).toContain(
            'data-merge-pad-tip="Leave it out, as current removed it"',
        );
    });

    it("shows icons with the label in the tooltip when the page asks for the icon pad", () => {
        document.body.dataset.mergePadStyle = "icons";
        const { provider } = build([LEAVE_OUT]);

        const { html } = provider.getContextPadEntries(TASK)["merge-leaveOut"];

        expect(html).toContain("<svg");
        expect(html).toContain('aria-label="Leave out"');
        expect(html).toContain(
            'data-merge-pad-tip="Leave out: Leave it out, as current removed it"',
        );
    });

    it("gives every pad decision the styled tooltip when the pad opens", () => {
        const { provider, open } = build([KEEP]);
        const html = document.createElement("div");
        html.innerHTML = provider.getContextPadEntries(TASK)["merge-keep"].html;
        document.body.append(html);

        open(html);

        expect(html.querySelector("button")?.getAttribute("data-merge-tooltip")).toBe(
            "Keep it as incoming has it",
        );
        html.remove();
    });

    it("moves the pad above the element where diagram-js's place would cover the end of its flow", () => {
        const { provider, open } = build([KEEP]);
        const end = { id: "End_1", x: 230, y: 122, width: 36, height: 36 };
        const flow = {
            id: "Flow_1",
            waypoints: [
                { x: 200, y: 140 },
                { x: 230, y: 140 },
            ],
            target: end,
        };
        const task = { id: "Task_1", x: 100, y: 100, width: 100, height: 80, outgoing: [flow] };
        Object.assign(flow, { source: task });
        const html = document.createElement("div");
        html.getBoundingClientRect = () => rect(0, 0, 120, 90);

        open(html, task);

        // diagram-js puts it at the task's right edge plus 8px; above, it starts at the task's left edge.
        expect(html.style.transform).toBe("translate(-108px, -96px)");
        expect(provider.padBox()).toStrictEqual({ left: 100, top: 4, width: 120, height: 90 });
    });

    it("moves the pad off another shape's name when a place next to the element covers nothing", () => {
        const process = { id: "Process_1" };
        const other = { id: "Task_Other", x: 230, y: 100, width: 100, height: 80, parent: process };
        const { open } = build([KEEP], { drawn: [process, other] });
        const html = document.createElement("div");
        html.getBoundingClientRect = () => rect(0, 0, 120, 90);

        open(html, { id: "Task_1", x: 100, y: 100, width: 100, height: 80, parent: process });

        expect(html.style.transform).toBe("translate(-108px, -96px)");
    });

    it("leaves the pad where diagram-js put it when nothing lies there", () => {
        const { provider, open } = build([KEEP]);
        const html = document.createElement("div");
        html.getBoundingClientRect = () => rect(0, 0, 120, 90);

        open(html, { id: "Task_1", x: 100, y: 100, width: 100, height: 80 });

        expect(html.style.transform).toBe("");
        expect(provider.padBox()).toStrictEqual({ left: 208, top: 100, width: 120, height: 90 });
    });

    it("offers nothing on the diagram's root or on an element without decisions", () => {
        const { provider } = build([KEEP]);

        expect(provider.getContextPadEntries(ROOT)).toStrictEqual({});
        expect(
            provider.getContextPadEntries({ id: "Task_2", businessObject: { id: "Task_2" } }),
        ).toStrictEqual({});
    });

    it("hands the clicked decision to the pane", () => {
        const { provider, entryConfig } = build([KEEP, UNDO]);
        const entries = provider.getContextPadEntries(TASK);

        entries["merge-keep"].action.click(new Event("click"), TASK);
        entries["merge-undo"].action.click(new Event("click"), TASK);

        expect(entryConfig.decide.mock.calls).toStrictEqual([
            ["Task_1", KEEP],
            ["Task_1", UNDO],
        ]);
    });
});

describe("createMergePickModule", () => {
    it("hands the provider the merge pane's callbacks", () => {
        const entryConfig = { decisionsOf: () => [], decide: vi.fn(), attach: vi.fn() };

        const module = createMergePickModule(entryConfig);

        expect(module.__init__).toStrictEqual(["mergePickContextPadProvider"]);
        expect(module.mergePickEntryConfig).toStrictEqual(["value", entryConfig]);
    });
});
