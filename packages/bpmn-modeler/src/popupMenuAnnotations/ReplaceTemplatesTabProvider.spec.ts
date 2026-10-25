import { describe, expect, it, vi } from "vitest";

import { ReplaceTemplatesTabProvider } from "./ReplaceTemplatesTabProvider";

function registeredProvider() {
    const popupMenu = { registerProvider: vi.fn() };
    const translate = vi.fn((text: string) => `de:${text}`);
    const provider = new ReplaceTemplatesTabProvider(popupMenu, translate);
    return { popupMenu, provider };
}

describe("ReplaceTemplatesTabProvider", () => {
    it("registers for the replace menu only, after the default-priority providers", () => {
        const { popupMenu, provider } = registeredProvider();

        expect(popupMenu.registerProvider).toHaveBeenCalledOnce();
        expect(popupMenu.registerProvider).toHaveBeenCalledWith("bpmn-replace", 400, provider);
    });

    it("moves template entries into a translated Templates tab and leaves the rest untabbed", () => {
        const { provider } = registeredProvider();

        const entries = provider.getPopupMenuEntries()({
            "replace-with-user-task": { label: "User task" },
            "replace-remove-element-template": { label: "Service task" },
            "replace.template-payment": { label: "Payment" },
        });

        expect(entries).toEqual({
            "replace-with-user-task": { label: "User task" },
            "replace-remove-element-template": { label: "Service task" },
            "replace.template-payment": {
                label: "Payment",
                tab: { id: "templates", label: "de:Templates" },
            },
        });
        expect(Object.keys(entries)).toEqual([
            "replace-with-user-task",
            "replace-remove-element-template",
            "replace.template-payment",
        ]);
    });
});
