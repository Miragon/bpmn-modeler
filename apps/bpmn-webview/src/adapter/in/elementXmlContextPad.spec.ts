import { describe, expect, it, vi } from "vitest";

// The viewer barrel pulls in bpmn-js's whole viewer, which jsdom cannot load.
vi.mock("@miragon/bpmn-modeler/viewer", () => ({
    bpmnElementIdOf: (element: { id: string }) => `bpmn-id-of:${element.id}`,
}));

import {
    createElementXmlChangesModule,
    ElementXmlChangesContextPadProvider,
} from "./elementXmlContextPad";

const ROOT = { id: "Process_1", businessObject: { id: "Process_1" } };
const TASK = { id: "Task_1", businessObject: { id: "Task_1" } };

function build(available = true) {
    const contextPad = { registerProvider: vi.fn() };
    const canvas = { getRootElement: () => ROOT };
    const translate = vi.fn((template: string) => `t(${template}) <&">`);
    const entryConfig = {
        canShowElementXmlChanges: vi.fn(() => available),
        showElementXmlChanges: vi.fn(),
    };
    const provider = new ElementXmlChangesContextPadProvider(
        contextPad,
        canvas,
        translate,
        entryConfig,
    );
    return { provider, contextPad, entryConfig };
}

describe("ElementXmlChangesContextPadProvider", () => {
    it("registers itself with the context pad", () => {
        const { provider, contextPad } = build();

        expect(contextPad.registerProvider).toHaveBeenCalledWith(provider);
    });

    it("offers a translated 'Show XML changes' button on an element", () => {
        const { provider } = build();

        const entry = provider.getContextPadEntries(TASK)["element-xml-changes"];

        expect(entry.title).toBe(`t(Show XML changes) <&">`);
        expect(entry.html).toMatch(/^<button type="button" class="entry[ "]/);
        expect(entry.html).toContain(`aria-label="t(Show XML changes) &lt;&amp;&quot;&gt;"`);
    });

    it("offers nothing until the host can show XML changes", () => {
        const { provider } = build(false);

        expect(provider.getContextPadEntries(TASK)).toEqual({});
    });

    it("offers nothing on the diagram's root", () => {
        const { provider } = build();

        expect(provider.getContextPadEntries(ROOT)).toEqual({});
    });

    it("asks the host for the XML changes of the BPMN element the clicked element shows", () => {
        const { provider, entryConfig } = build();

        provider
            .getContextPadEntries(TASK)
            ["element-xml-changes"].action.click(new Event("click"), TASK);

        expect(entryConfig.showElementXmlChanges).toHaveBeenCalledExactlyOnceWith(
            "bpmn-id-of:Task_1",
        );
    });
});

describe("createElementXmlChangesModule", () => {
    it("hands the provider the diff pane's callbacks", () => {
        const entryConfig = {
            canShowElementXmlChanges: () => true,
            showElementXmlChanges: vi.fn(),
        };

        const module = createElementXmlChangesModule(entryConfig);

        expect(module.elementXmlChangesEntryConfig).toEqual(["value", entryConfig]);
        expect(module.__init__).toEqual(["elementXmlChangesContextPadProvider"]);
    });
});
