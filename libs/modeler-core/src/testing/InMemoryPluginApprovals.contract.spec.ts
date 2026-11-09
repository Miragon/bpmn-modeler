import { InMemoryPluginApprovals } from "./InMemoryPluginApprovals";
import { describePluginApprovalStoreContract } from "./pluginApprovalStoreContract";

describePluginApprovalStoreContract("InMemoryPluginApprovals", async () => {
    const store = new InMemoryPluginApprovals();
    return {
        store,
        storeElsewhere: async (approvals, options) => store.storeElsewhere(approvals, options),
    };
});
