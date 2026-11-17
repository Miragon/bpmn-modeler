import { describe, expect, it, vi } from "vitest";

import type { MergePadDecision } from "../../domain/mergePadDecisions";

// The viewer barrel pulls in bpmn-js's whole viewer, which jsdom cannot load.
vi.mock("@miragon/bpmn-modeler/viewer", () => ({
    bpmnElementIdOf: (element: { businessObject: { id: string } }) => element.businessObject.id,
}));

import { createMergePickModule, MergePickContextPadProvider } from "./mergePickContextPad";
import { MERGE_TOOLTIP_ATTRIBUTE } from "./mergeTooltip";

const ROOT = { id: "Process_1", businessObject: { id: "Process_1" } };
const TASK = { id: "Task_1", businessObject: { id: "Task_1" } };
const TASK_LABEL = { id: "Task_1_label", businessObject: { id: "Task_1" } };

const OFFER = { elementId: "Task_1", connections: ["Flow_1", "Flow_2"], removedBy: "current" };

const EVERY_DECISION: readonly MergePadDecision[] = [
    { kind: "keep", scope: "element", side: "incoming" },
    { kind: "keep", scope: "withContents", side: "incoming", reach: "contents" },
    { kind: "leaveOut", side: "current", otherSideLacks: "removed" },
    { kind: "keepRemovedFlows", side: "incoming", offer: OFFER } as MergePadDecision,
    { kind: "undo", scope: "withContents" },
];

const untranslated = (key: string, replacements: Record<string, string> = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? `{${name}}`);

function build(
    decisions: readonly MergePadDecision[],
    { open = false, selected = [TASK] as readonly (typeof TASK)[] } = {},
) {
    const contextPad = {
        registerProvider: vi.fn(),
        isOpen: vi.fn(() => open),
        open: vi.fn(),
    };
    const canvas = { getRootElement: () => ROOT };
    const selection = { get: () => selected };
    const listeners = new Map<string, () => void>();
    const eventBus = {
        on: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    };
    const entryConfig = {
        decisionsOf: vi.fn((id: string) => (id === "Task_1" ? decisions : [])),
        decide: vi.fn(),
        attach: vi.fn(),
        selectionChanged: vi.fn(),
    };
    const provider = new MergePickContextPadProvider(
        contextPad,
        canvas,
        selection,
        eventBus,
        untranslated,
        entryConfig,
    );
    const fire = (event: string) => listeners.get(event)?.();
    return { provider, contextPad, entryConfig, fire };
}

/** Each entry's button as diagram-js renders it from the entry's html. */
function buttonsOf(entries: Record<string, { html: string }>): HTMLButtonElement[] {
    return Object.values(entries).map(({ html }) => {
        const host = document.createElement("div");
        host.innerHTML = html;
        return host.firstElementChild as HTMLButtonElement;
    });
}

describe("MergePickContextPadProvider", () => {
    it("registers itself with the context pad, hands itself to the merge pane and sets up the tooltips", () => {
        const { provider, contextPad, entryConfig } = build([]);

        expect(contextPad.registerProvider).toHaveBeenCalledWith(provider);
        expect(entryConfig.attach).toHaveBeenCalledWith(provider);
        expect(document.querySelector(".merge-tooltip")).not.toBeNull();
    });

    it("reopens an open pad on the selected element, since the pad reads its entries only when it opens", () => {
        const { provider, contextPad } = build([], { open: true });

        provider.refresh();

        expect(contextPad.open).toHaveBeenCalledExactlyOnceWith(TASK, true);
    });

    it.each([
        ["an element", [TASK], "Task_1"],
        ["a label, as the element it labels", [TASK_LABEL], "Task_1"],
        ["nothing", [], undefined],
        ["several elements", [TASK, TASK_LABEL], undefined],
        ["the root", [ROOT], undefined],
    ])("names the element whose pad a keyboard command runs: %s", (_case, selected, id) => {
        const { provider } = build([], { selected });

        expect(provider.selectedElementId()).toBe(id);
    });

    it("tells the merge pane of every selection change, a step's and the partner's included", () => {
        const { entryConfig, fire } = build([]);

        fire("selection.changed");

        expect(entryConfig.selectionChanged).toHaveBeenCalledOnce();
    });

    it("leaves a closed pad closed", () => {
        const { provider, contextPad } = build([], { open: false });

        provider.refresh();

        expect(contextPad.open).not.toHaveBeenCalled();
    });

    it("offers every decision the pane names, in its order, in its own group", () => {
        const { provider } = build(EVERY_DECISION);

        const entries = provider.getContextPadEntries(TASK);

        expect(Object.keys(entries)).toStrictEqual([
            "merge-keep",
            "merge-keep-inside",
            "merge-leave-out",
            "merge-keep-removed-flows",
            "merge-undo",
        ]);
        expect(Object.values(entries).every(({ group }) => group === "merge-pick")).toBe(true);
    });

    it("shows each decision as an icon button with the side in its label and its styled tooltip, and no native title", () => {
        const { provider } = build(EVERY_DECISION);

        const entries = provider.getContextPadEntries(TASK);
        const buttons = buttonsOf(entries);

        expect(buttons.map((button) => button.getAttribute("aria-label"))).toStrictEqual([
            "Keep incoming",
            "Keep incoming with everything inside",
            "Leave out: Leave it out, as current removed it",
            "Also keep its removed flows",
            "Undo pick",
        ]);
        expect(buttons[0].getAttribute(MERGE_TOOLTIP_ATTRIBUTE)).toBe(
            "Keep incoming: Keep it as incoming has it",
        );
        expect(buttons[1].getAttribute(MERGE_TOOLTIP_ATTRIBUTE)).toBe(
            "Keep incoming with everything inside: Keep it and everything inside as incoming has them",
        );
        expect(buttons[3].getAttribute(MERGE_TOOLTIP_ATTRIBUTE)).toBe(
            "Also keep its removed flows: Also keep the 2 flows current removed with it",
        );
        for (const button of buttons) {
            expect(button.tagName).toBe("BUTTON");
            expect(button.classList.contains("entry")).toBe(true);
            expect(button.querySelector("svg")).not.toBeNull();
            expect(button.textContent).toBe("");
            expect(button.hasAttribute("title")).toBe(false);
        }
        expect(Object.values(entries).some((entry) => "title" in entry)).toBe(false);
    });

    it("words keeping everything inside by the reach the library tells", () => {
        const [button] = buttonsOf(
            build([
                { kind: "keep", scope: "withContents", side: "current", reach: "poolProcesses" },
            ]).provider.getContextPadEntries(TASK),
        );

        expect(button?.getAttribute(MERGE_TOOLTIP_ATTRIBUTE)).toBe(
            "Keep current with everything inside: Keep it and every pool with its process as current has them",
        );
    });

    it("gives each decision a glyph of its own, the same on both panes", () => {
        const incoming = buttonsOf(build(EVERY_DECISION).provider.getContextPadEntries(TASK));
        const current = buttonsOf(
            build([
                { kind: "keep", scope: "element", side: "current" },
                { kind: "leaveOut", side: "incoming", otherSideLacks: "missing" },
            ]).provider.getContextPadEntries(TASK),
        );
        const glyph = (button: HTMLButtonElement) => button.querySelector("svg")?.innerHTML;

        expect(new Set(incoming.map(glyph)).size).toBe(EVERY_DECISION.length);
        expect(glyph(current[0])).toBe(glyph(incoming[0]));
        expect(glyph(current[1])).toBe(glyph(incoming[2]));
    });

    it("hands the clicked decision to the merge pane with the element's BPMN id", () => {
        const { provider, entryConfig } = build(EVERY_DECISION);
        const entries = provider.getContextPadEntries(TASK);

        entries["merge-leave-out"].action.click(new Event("click"), TASK_LABEL);
        entries["merge-undo"].action.click(new Event("click"), TASK);

        expect(entryConfig.decide.mock.calls).toStrictEqual([
            ["Task_1", EVERY_DECISION[2]],
            ["Task_1", EVERY_DECISION[4]],
        ]);
    });

    it("offers nothing on the diagram's root or on an element the pane offers nothing for", () => {
        const { provider } = build(EVERY_DECISION);

        expect(provider.getContextPadEntries(ROOT)).toStrictEqual({});
        expect(
            provider.getContextPadEntries({ id: "Other", businessObject: { id: "Other" } }),
        ).toStrictEqual({});
    });
});

describe("createMergePickModule", () => {
    it("hands the provider the merge pane's callbacks", () => {
        const entryConfig = {
            decisionsOf: () => [],
            decide: vi.fn(),
            attach: vi.fn(),
            selectionChanged: vi.fn(),
        };

        const module = createMergePickModule(entryConfig);

        expect(module.__init__).toStrictEqual(["mergePickContextPadProvider"]);
        expect(module.mergePickEntryConfig).toStrictEqual(["value", entryConfig]);
    });
});
