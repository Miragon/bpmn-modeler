import { InMemoryPluginApprovals } from "./InMemoryPluginApprovals";
import { describePluginApprovalStoreContract } from "./pluginApprovalStoreContract";

describePluginApprovalStoreContract("InMemoryPluginApprovals", async () => ({
    store: new InMemoryPluginApprovals(),
}));
