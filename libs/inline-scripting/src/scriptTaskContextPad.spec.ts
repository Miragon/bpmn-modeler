import { describe, expect, it, vi } from "vitest";

import type { Element } from "./bpmnTypes";
import { ScriptTaskContextPadProvider } from "./scriptTaskContextPad";

function build() {
    const contextPad = { registerProvider: vi.fn() };
    const opener = { openScriptTask: vi.fn(() => true) };
    const provider = new ScriptTaskContextPadProvider(contextPad, opener as never);
    return { provider, contextPad, opener };
}

describe("ScriptTaskContextPadProvider", () => {
    it("registers itself so the context pad asks it for entries", () => {
        const { provider, contextPad } = build();

        expect(contextPad.registerProvider).toHaveBeenCalledExactlyOnceWith(provider);
    });

    it.each<[string, Element]>([
        ["a service task", { id: "Task_1", businessObject: { $type: "bpmn:ServiceTask" } }],
        ["an element without a business object", { id: "Label_1" }],
    ])("offers no entry for %s", (_label, element) => {
        const { provider } = build();

        expect(provider.getContextPadEntries(element)).toEqual({});
    });

    it("offers an Edit Script entry that opens the script task through the shared opener", () => {
        const { provider, opener } = build();
        const scriptTask = { id: "Task_1", businessObject: { $type: "bpmn:ScriptTask" } };

        const entries = provider.getContextPadEntries(scriptTask);
        entries["edit-script"].action.click();

        expect(Object.keys(entries)).toEqual(["edit-script"]);
        expect(entries["edit-script"]).toMatchObject({ group: "edit", title: "Edit Script" });
        expect(opener.openScriptTask).toHaveBeenCalledExactlyOnceWith(scriptTask);
    });
});
