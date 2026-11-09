import { describePluginApprovalStoreContract } from "@miragon/bpmn-modeler-core/testing";

import { InMemoryMemento } from "../../../../__fixtures__/vscodeStorage";
import { APPROVALS_KEY, VsCodePluginApprovalStore } from "./VsCodePluginApprovalStore";

describePluginApprovalStoreContract("VsCodePluginApprovalStore over a global-state memento", async () => {
    const globalState = new InMemoryMemento();
    const store = new VsCodePluginApprovalStore(globalState);
    return {
        store,
        storeElsewhere: async (approvals, { notify = false } = {}) => {
            await globalState.update(APPROVALS_KEY, approvals);
            // What the composition does when the window gains focus.
            if (notify) await store.readStored();
        },
    };
});
