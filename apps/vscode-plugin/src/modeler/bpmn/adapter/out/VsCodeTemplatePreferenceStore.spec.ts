import { describe, expect, it } from "vitest";

import { templatePreferenceChange } from "@miragon/bpmn-modeler-core";

import { FailingMemento, InMemoryMemento } from "../../../../__fixtures__/vscodeStorage";
import {
    TEMPLATE_PREFERENCES_KEY,
    VsCodeTemplatePreferenceStore,
} from "./VsCodeTemplatePreferenceStore";

const SHOP_OFF = { source: "configFolder:shop/.camunda" };
const ACME_OFF = { source: "marketplace:local:/opt/acme", templateId: "rest" };

describe("VsCodeTemplatePreferenceStore", () => {
    it("keeps this project's switches in the workspace state and every project's in the global state", async () => {
        const workspaceState = new InMemoryMemento();
        const globalState = new InMemoryMemento();
        const store = new VsCodeTemplatePreferenceStore({
            project: workspaceState,
            allProjects: globalState,
        });

        await store.change(templatePreferenceChange("project", [SHOP_OFF], []));
        await store.change(templatePreferenceChange("allProjects", [ACME_OFF], []));

        expect([
            workspaceState.keys(),
            workspaceState.get(TEMPLATE_PREFERENCES_KEY),
            globalState.keys(),
            globalState.get(TEMPLATE_PREFERENCES_KEY),
        ]).toEqual([
            ["bpmnTemplatePreferences"],
            { disabled: [SHOP_OFF] },
            ["bpmnTemplatePreferences"],
            { disabled: [ACME_OFF] },
        ]);
    });

    it("reads switches a hand-edited state holds, leaving out what is no switch", () => {
        const workspaceState = new InMemoryMemento();
        void workspaceState.update(TEMPLATE_PREFERENCES_KEY, {
            disabled: [SHOP_OFF, { source: 3 }, "x"],
        });
        const store = new VsCodeTemplatePreferenceStore({
            project: workspaceState,
            allProjects: new InMemoryMemento(),
        });

        expect(store.read()).toEqual({
            project: { disabled: [SHOP_OFF] },
            allProjects: { disabled: [] },
        });
    });

    it.each([
        { keepsRejectedValue: true, announced: 1 },
        { keepsRejectedValue: false, announced: 0 },
    ])(
        "announces a rejected write only when the memento kept its value (keeps: $keepsRejectedValue)",
        async ({ keepsRejectedValue, announced }) => {
            const globalState = new FailingMemento(keepsRejectedValue);
            globalState.failAfter(0, "disk full");
            const store = new VsCodeTemplatePreferenceStore({
                project: new InMemoryMemento(),
                allProjects: globalState,
            });
            let announcements = 0;
            store.onDidChange(() => announcements++);

            await expect(
                store.change(templatePreferenceChange("allProjects", [ACME_OFF], [])),
            ).rejects.toThrow("disk full");

            expect(announcements).toBe(announced);
            expect(store.read().allProjects).toEqual({
                disabled: keepsRejectedValue ? [ACME_OFF] : [],
            });
        },
    );
});
