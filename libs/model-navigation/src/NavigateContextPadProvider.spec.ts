import { beforeEach, describe, expect, it, vi } from "vitest";

// Drives the `is()` import below.  Tests set `isMatchers` to control which
// BPMN types the helper says the current element implements.
const isMatchers: Set<string> = new Set();
vi.mock("bpmn-js/lib/util/ModelUtil", () => ({
    is: (_element: unknown, type: string) => isMatchers.has(type),
}));

import { NavigateToReferencedModelCommand } from "@miragon/bpmn-modeler-shared";

import { NavigateContextPadProvider } from "./NavigateContextPadProvider";

interface MutableElement {
    businessObject: {
        get(name: string): unknown;
        extensionElements?: { values?: unknown[] };
    };
}

function build(
    opts: {
        types?: string[];
        initialAttrs?: Record<string, unknown>;
    } = {},
) {
    isMatchers.clear();
    for (const t of opts.types ?? []) isMatchers.add(t);

    const attrs: Record<string, unknown> = { ...opts.initialAttrs };
    const element: MutableElement = {
        businessObject: {
            get: (name) => attrs[name],
        },
    };

    const contextPad = { registerProvider: vi.fn() };
    const translate = vi.fn((template: string) => `t(${template})`);
    const vsCodeBridge = { postMessage: vi.fn() };

    const provider = new NavigateContextPadProvider(
        contextPad as never,
        translate as never,
        vsCodeBridge as never,
    );

    return { provider, contextPad, translate, vsCodeBridge, element, attrs };
}

beforeEach(() => {
    isMatchers.clear();
});

describe("NavigateContextPadProvider", () => {
    it("registers itself with the contextPad on construction", () => {
        const { provider, contextPad } = build();

        expect(contextPad.registerProvider).toHaveBeenCalledWith(provider);
        expect(contextPad.registerProvider).toHaveBeenCalledTimes(1);
    });

    it("returns no entries for an unrelated element type", () => {
        const { provider, element } = build({ types: [] });

        expect(provider.getContextPadEntries(element as never)).toEqual({});
    });

    it("returns no entries when a Call Activity has no calledElement", () => {
        const { provider, element } = build({
            types: ["bpmn:CallActivity"],
            initialAttrs: { calledElement: "" },
        });

        expect(provider.getContextPadEntries(element as never)).toEqual({});
    });

    it("contributes a single entry in the connect group for a Call Activity with reference", () => {
        const { provider, element } = build({
            types: ["bpmn:CallActivity"],
            initialAttrs: { calledElement: "ProcessB" },
        });

        const entries = provider.getContextPadEntries(element as never);

        expect(Object.keys(entries)).toEqual(["navigate-to-referenced-model"]);
        const entry = entries["navigate-to-referenced-model"];
        expect(entry.group).toBe("connect");
        expect(entry.html).toContain('<div class="entry">');
        expect(entry.html).toContain("<svg");
    });

    it("contributes an entry for a Business Rule Task with decisionRef", () => {
        const { provider, element } = build({
            types: ["bpmn:BusinessRuleTask"],
            initialAttrs: { "camunda:decisionRef": "Decision_1" },
        });

        const entries = provider.getContextPadEntries(element as never);

        expect(entries["navigate-to-referenced-model"]).toBeDefined();
    });

    it("routes the title through the translator", () => {
        const { provider, translate, element } = build({
            types: ["bpmn:CallActivity"],
            initialAttrs: { calledElement: "ProcessB" },
        });

        const entry = provider.getContextPadEntries(element as never)[
            "navigate-to-referenced-model"
        ];

        expect(translate).toHaveBeenCalledWith("Navigate to referenced model");
        expect(entry.title).toBe("t(Navigate to referenced model)");
    });

    it("re-extracts the reference id on click — not the value captured at render time", () => {
        // Build the pad while the id is "Original".  Mutate to "Updated"
        // before invoking click — the posted command must carry "Updated".
        const { provider, vsCodeBridge, element, attrs } = build({
            types: ["bpmn:CallActivity"],
            initialAttrs: { calledElement: "Original" },
        });
        const entry = provider.getContextPadEntries(element as never)[
            "navigate-to-referenced-model"
        ];

        attrs.calledElement = "Updated";
        entry.action.click({} as never, element as never);

        expect(vsCodeBridge.postMessage).toHaveBeenCalledTimes(1);
        const posted = vsCodeBridge.postMessage.mock.calls[0][0];
        expect(posted).toBeInstanceOf(NavigateToReferencedModelCommand);
        expect((posted as NavigateToReferencedModelCommand).referenceId).toBe("Updated");
        expect((posted as NavigateToReferencedModelCommand).referenceKind).toBe("process");
    });

    it("does nothing when the reference id was cleared between render and click", () => {
        const { provider, vsCodeBridge, element, attrs } = build({
            types: ["bpmn:CallActivity"],
            initialAttrs: { calledElement: "Original" },
        });
        const entry = provider.getContextPadEntries(element as never)[
            "navigate-to-referenced-model"
        ];

        attrs.calledElement = "";
        entry.action.click({} as never, element as never);

        expect(vsCodeBridge.postMessage).not.toHaveBeenCalled();
    });

    it("posts a decision-kind command for Business Rule Tasks", () => {
        const { provider, vsCodeBridge, element } = build({
            types: ["bpmn:BusinessRuleTask"],
            initialAttrs: { "camunda:decisionRef": "Decision_1" },
        });
        const entry = provider.getContextPadEntries(element as never)[
            "navigate-to-referenced-model"
        ];

        entry.action.click({} as never, element as never);

        const posted = vsCodeBridge.postMessage.mock
            .calls[0][0] as NavigateToReferencedModelCommand;
        expect(posted.referenceKind).toBe("decision");
        expect(posted.referenceId).toBe("Decision_1");
    });
});
