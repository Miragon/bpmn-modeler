import { InMemoryWorkspaceTrust } from "./inMemoryHostSurfaces";
import { describeWorkspaceTrustContract } from "./workspaceTrustContract";

describeWorkspaceTrustContract("InMemoryWorkspaceTrust", async () => {
    const trust = new InMemoryWorkspaceTrust(false);
    return {
        trust,
        grant: async () => trust.setTrusted(true),
        withdraw: async () => trust.setTrusted(false),
    };
});
