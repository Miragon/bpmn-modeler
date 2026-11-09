import { describePluginApprovalStoreContract } from "@miragon/bpmn-modeler-core/testing";

import { InMemoryMemento } from "../../../../__fixtures__/vscodeStorage";
import { APPROVALS_KEY, VsCodePluginApprovalStore } from "./VsCodePluginApprovalStore";

describePluginApprovalStoreContract("VsCodePluginApprovalStore over a global-state memento", async () => {
    const globalState = new InMemoryMemento();
    return {
        store: new VsCodePluginApprovalStore(globalState),
        storeElsewhere: (approvals) => globalState.update(APPROVALS_KEY, approvals),
    };
});
