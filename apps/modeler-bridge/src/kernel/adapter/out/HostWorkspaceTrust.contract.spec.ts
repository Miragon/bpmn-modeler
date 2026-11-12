import { describeWorkspaceTrustContract } from "@miragon/bpmn-modeler-core/testing";

import { HostWorkspaceTrust } from "./HostWorkspaceTrust";

describeWorkspaceTrustContract("HostWorkspaceTrust fed by the host's snapshots", async () => {
    const trust = new HostWorkspaceTrust();
    let revision = 0;
    return {
        trust,
        grant: async () => trust.apply({ trusted: true, revision: ++revision }),
        withdraw: async () => trust.apply({ trusted: false, revision: ++revision }),
    };
});
