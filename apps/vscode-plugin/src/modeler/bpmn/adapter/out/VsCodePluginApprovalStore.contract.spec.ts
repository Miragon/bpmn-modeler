import { Memento } from "vscode";

import {
    describePluginApprovalStoreContract,
    PluginApprovalStoreContractFixture,
} from "@miragon/bpmn-modeler-core/testing";

import { InMemoryMemento, YieldingMemento } from "../../../../__fixtures__/vscodeStorage";
import { APPROVALS_KEY, VsCodePluginApprovalStore } from "./VsCodePluginApprovalStore";

function storeOver(globalState: Memento): PluginApprovalStoreContractFixture {
    const store = new VsCodePluginApprovalStore(globalState);
    return {
        store,
        storeElsewhere: async (approvals, { notify = false } = {}) => {
            await globalState.update(APPROVALS_KEY, approvals);
            // What the composition does when the window gains focus.
            if (notify) await store.readStored();
        },
    };
}

describePluginApprovalStoreContract("VsCodePluginApprovalStore over a global-state memento", async () =>
    storeOver(new InMemoryMemento()),
);

describePluginApprovalStoreContract(
    "VsCodePluginApprovalStore over a memento that stores only after update yields",
    async () => storeOver(new YieldingMemento()),
);
