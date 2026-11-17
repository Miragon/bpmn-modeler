import { describe, expect, it, vi } from "vitest";

import type { MergePanePickable } from "@miragon/bpmn-modeler-shared";

// The viewer barrel pulls in bpmn-js's whole viewer, which jsdom cannot load.
vi.mock("@miragon/bpmn-modeler/viewer", () => ({
    bpmnElementIdOf: (element: { id: string }) => element.id,
}));

import { createMergePickModule, MergePickContextPadProvider } from "./mergePickContextPad";

const ROOT = { id: "Process_1", businessObject: { id: "Process_1" } };
const TASK = { id: "Task_1", businessObject: { id: "Task_1" } };
const SUB = { id: "Sub_1", businessObject: { id: "Sub_1" } };

function build(pickable: readonly MergePanePickable[], { open = false, selected = [TASK] } = {}) {
    const contextPad = {
        registerProvider: vi.fn(),
        isOpen: vi.fn(() => open),
        open: vi.fn(),
    };
    const canvas = { getRootElement: () => ROOT };
    const selection = { get: () => selected };
    const translate = vi.fn((template: string) => `t(${template})`);
    const entryConfig = {
        pickableOf: vi.fn((id: string) => pickable.find((entry) => entry.id === id)),
        pick: vi.fn(),
        unpick: vi.fn(),
        attach: vi.fn(),
    };
    const provider = new MergePickContextPadProvider(
        contextPad,
        canvas,
        selection,
        translate,
        entryConfig,
    );
    return { provider, contextPad, entryConfig };
}

describe("MergePickContextPadProvider", () => {
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

    it("offers to keep an element from this pane, as a translated button in its own group", () => {
        const { provider } = build([{ id: "Task_1", container: false }]);

        const entries = provider.getContextPadEntries(TASK);

        expect(Object.keys(entries)).toStrictEqual(["merge-keep"]);
        expect(entries["merge-keep"].group).toBe("merge-pick");
        expect(entries["merge-keep"].title).toBe("t(Keep this version)");
        expect(entries["merge-keep"].html).toMatch(/^<button type="button" class="entry[ "]/);
        expect(entries["merge-keep"].html).toContain('aria-label="t(Keep this version)"');
    });

    it("offers to keep everything inside a container and to undo a pick, as the host says", () => {
        const { provider } = build([{ id: "Sub_1", container: true, undo: "withContents" }]);

        expect(Object.keys(provider.getContextPadEntries(SUB))).toStrictEqual([
            "merge-keep",
            "merge-keep-inside",
            "merge-undo",
        ]);
    });

    it("offers nothing on the diagram's root or on an element the host does not list", () => {
        const { provider } = build([{ id: "Process_1", container: true }]);

        expect(provider.getContextPadEntries(ROOT)).toStrictEqual({});
        expect(provider.getContextPadEntries(TASK)).toStrictEqual({});
    });

    it("posts the pick and the undo with the reach the host named", () => {
        const { provider, entryConfig } = build([
            { id: "Sub_1", container: true, undo: "withContents" },
        ]);
        const entries = provider.getContextPadEntries(SUB);
        const click = (name: string) => entries[name].action.click(new Event("click"), SUB);

        click("merge-keep");
        click("merge-keep-inside");
        click("merge-undo");

        expect(entryConfig.pick.mock.calls).toStrictEqual([
            ["Sub_1", "element"],
            ["Sub_1", "withContents"],
        ]);
        expect(entryConfig.unpick).toHaveBeenCalledExactlyOnceWith("Sub_1", "withContents");
    });
});

describe("createMergePickModule", () => {
    it("hands the provider the merge pane's callbacks", () => {
        const entryConfig = {
            pickableOf: () => undefined,
            pick: vi.fn(),
            unpick: vi.fn(),
            attach: vi.fn(),
        };

        const module = createMergePickModule(entryConfig);

        expect(module.__init__).toStrictEqual(["mergePickContextPadProvider"]);
        expect(module.mergePickEntryConfig).toStrictEqual(["value", entryConfig]);
    });
});
