import { beforeEach, describe, expect, it, vi } from "vitest";

// Drives the `is()` import below. Tests set `isMatchers` to control which BPMN
// types the helper says the current element implements.
const isMatchers: Set<string> = new Set();
vi.mock("bpmn-js/lib/util/ModelUtil", () => ({
    is: (_element: unknown, type: string) => isMatchers.has(type),
}));

import { NavigateToImplementationCommand } from "@miragon/bpmn-modeler-shared";

import { CodeLinkContextPadProvider } from "./CodeLinkContextPadProvider";

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
        resolved?: boolean;
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
    // The map client gates visibility; default to "resolved" so the existing
    // (pre-map) cases behave exactly as before.
    const client = { isResolved: vi.fn().mockReturnValue(opts.resolved ?? true) };

    const provider = new CodeLinkContextPadProvider(
        contextPad as never,
        translate as never,
        vsCodeBridge as never,
        client as never,
    );

    return { provider, contextPad, translate, vsCodeBridge, client, element, attrs };
}

beforeEach(() => {
    isMatchers.clear();
});

describe("CodeLinkContextPadProvider", () => {
    it("registers itself with the contextPad on construction", () => {
        const { provider, contextPad } = build();

        expect(contextPad.registerProvider).toHaveBeenCalledWith(provider);
        expect(contextPad.registerProvider).toHaveBeenCalledTimes(1);
    });

    it("returns no entries for an unrelated element type", () => {
        const { provider, element } = build({
            types: [],
            initialAttrs: { "camunda:class": "com.example.X" },
        });

        expect(provider.getContextPadEntries(element as never)).toEqual({});
    });

    it("returns no entries when an implementable task has no binding", () => {
        const { provider, element } = build({ types: ["bpmn:ServiceTask"] });

        expect(provider.getContextPadEntries(element as never)).toEqual({});
    });

    it("contributes a single entry in the connect group for a service task with a class", () => {
        const { provider, element } = build({
            types: ["bpmn:ServiceTask"],
            initialAttrs: { "camunda:class": "com.example.MyDelegate" },
        });

        const entries = provider.getContextPadEntries(element as never);

        expect(Object.keys(entries)).toEqual(["go-to-implementation"]);
        const entry = entries["go-to-implementation"];
        expect(entry.group).toBe("connect");
        expect(entry.html).toContain('<div class="entry">');
        expect(entry.html).toContain("<svg");
    });

    it("contributes an entry for a send task with a delegate expression", () => {
        const { provider, element } = build({
            types: ["bpmn:SendTask"],
            initialAttrs: { "camunda:delegateExpression": "${myBean}" },
        });

        expect(
            provider.getContextPadEntries(element as never)["go-to-implementation"],
        ).toBeDefined();
    });

    it("contributes an entry for a business-rule task with a class binding", () => {
        const { provider, element } = build({
            types: ["bpmn:BusinessRuleTask"],
            initialAttrs: { "camunda:class": "com.example.Rules" },
        });

        expect(
            provider.getContextPadEntries(element as never)["go-to-implementation"],
        ).toBeDefined();
    });

    it("stays out of the way of a business-rule task that only references a decision", () => {
        const { provider, element } = build({
            types: ["bpmn:BusinessRuleTask"],
            initialAttrs: { "camunda:decisionRef": "Decision_1" },
        });

        expect(provider.getContextPadEntries(element as never)).toEqual({});
    });

    it("hides the entry when the host has reported the reference as unresolved", () => {
        const { provider, element, client } = build({
            types: ["bpmn:ServiceTask"],
            initialAttrs: { "camunda:class": "com.example.Missing" },
            resolved: false,
        });

        expect(provider.getContextPadEntries(element as never)).toEqual({});
        expect(client.isResolved).toHaveBeenCalledWith(element);
    });

    it("does not consult the map client for a non-implementable element", () => {
        // The cheap type/binding checks must short-circuit first so the client
        // is only asked about elements that could actually carry the entry.
        const { provider, element, client } = build({
            types: [],
            initialAttrs: { "camunda:class": "com.example.X" },
            resolved: false,
        });

        expect(provider.getContextPadEntries(element as never)).toEqual({});
        expect(client.isResolved).not.toHaveBeenCalled();
    });

    it("shows the entry while resolution is still unknown (optimistic)", () => {
        // A real client returns true for unknown — assert the provider shows the
        // entry whenever the client says resolved, the cold-open flash-free path.
        const { provider, element } = build({
            types: ["bpmn:ServiceTask"],
            initialAttrs: { "camunda:class": "com.example.MyDelegate" },
            resolved: true,
        });

        expect(
            provider.getContextPadEntries(element as never)["go-to-implementation"],
        ).toBeDefined();
    });

    it("routes the title through the translator", () => {
        const { provider, translate, element } = build({
            types: ["bpmn:ServiceTask"],
            initialAttrs: { "camunda:class": "com.example.MyDelegate" },
        });

        const entry = provider.getContextPadEntries(element as never)["go-to-implementation"];

        expect(translate).toHaveBeenCalledWith("Go to implementation");
        expect(entry.title).toBe("t(Go to implementation)");
    });

    it("re-extracts the reference on click — not the value captured at render time", () => {
        const { provider, vsCodeBridge, element, attrs } = build({
            types: ["bpmn:ServiceTask"],
            initialAttrs: { "camunda:class": "com.example.Original" },
        });
        const entry = provider.getContextPadEntries(element as never)["go-to-implementation"];

        attrs["camunda:class"] = "com.example.Updated";
        entry.action.click({} as never, element as never);

        expect(vsCodeBridge.postMessage).toHaveBeenCalledTimes(1);
        const posted = vsCodeBridge.postMessage.mock.calls[0][0];
        expect(posted).toBeInstanceOf(NavigateToImplementationCommand);
        expect((posted as NavigateToImplementationCommand).reference).toBe("com.example.Updated");
        expect((posted as NavigateToImplementationCommand).kind).toBe("javaClass");
    });

    it("does nothing when the binding was cleared between render and click", () => {
        const { provider, vsCodeBridge, element, attrs } = build({
            types: ["bpmn:ServiceTask"],
            initialAttrs: { "camunda:class": "com.example.Original" },
        });
        const entry = provider.getContextPadEntries(element as never)["go-to-implementation"];

        attrs["camunda:class"] = "";
        entry.action.click({} as never, element as never);

        expect(vsCodeBridge.postMessage).not.toHaveBeenCalled();
    });

    it("posts a jobType command for a C8 task definition", () => {
        isMatchers.clear();
        isMatchers.add("bpmn:ServiceTask");
        const element = {
            businessObject: {
                get: () => undefined,
                extensionElements: {
                    values: [{ $type: "zeebe:TaskDefinition", type: "payment-service" }],
                },
            },
        };
        const contextPad = { registerProvider: vi.fn() };
        const vsCodeBridge = { postMessage: vi.fn() };
        const client = { isResolved: vi.fn().mockReturnValue(true) };
        const provider = new CodeLinkContextPadProvider(
            contextPad as never,
            ((s: string) => s) as never,
            vsCodeBridge as never,
            client as never,
        );

        const entry = provider.getContextPadEntries(element as never)["go-to-implementation"];
        entry.action.click({} as never, element as never);

        const posted = vsCodeBridge.postMessage.mock.calls[0][0] as NavigateToImplementationCommand;
        expect(posted.kind).toBe("jobType");
        expect(posted.reference).toBe("payment-service");
    });
});
