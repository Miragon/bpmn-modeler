import { Memento } from "vscode";

import {
    describeTemplatePreferenceStoreContract,
    TemplatePreferenceStoreContractFixture,
} from "@miragon/bpmn-modeler-core/testing";

import { InMemoryMemento, YieldingMemento } from "../../../../__fixtures__/vscodeStorage";
import {
    TEMPLATE_PREFERENCES_KEY,
    VsCodeTemplatePreferenceStore,
} from "./VsCodeTemplatePreferenceStore";

function storeOver(
    workspaceState: Memento,
    globalState: Memento,
): TemplatePreferenceStoreContractFixture {
    const mementos = { project: workspaceState, allProjects: globalState };
    const store = new VsCodeTemplatePreferenceStore(mementos);
    return {
        store,
        storeElsewhere: async (scope, preferences, { notify = false } = {}) => {
            await mementos[scope].update(TEMPLATE_PREFERENCES_KEY, preferences);
            // What the composition does when the window gains focus.
            if (notify) await store.readStored();
        },
    };
}

describeTemplatePreferenceStoreContract(
    "VsCodeTemplatePreferenceStore over workspace- and global-state mementos",
    async () => storeOver(new InMemoryMemento(), new InMemoryMemento()),
);

describeTemplatePreferenceStoreContract(
    "VsCodeTemplatePreferenceStore over mementos that store only after update yields",
    async () => storeOver(new YieldingMemento(), new YieldingMemento()),
);
