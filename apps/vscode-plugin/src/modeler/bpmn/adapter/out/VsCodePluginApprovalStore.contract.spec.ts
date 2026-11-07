import { describePluginApprovalStoreContract } from "@miragon/bpmn-modeler-core/testing";

import { InMemoryMemento } from "../../../../__fixtures__/vscodeStorage";
import { VsCodePluginApprovalStore } from "./VsCodePluginApprovalStore";

describePluginApprovalStoreContract("VsCodePluginApprovalStore over a global-state memento", async () => ({
    store: new VsCodePluginApprovalStore(new InMemoryMemento()),
}));
