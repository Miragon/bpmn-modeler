import { describeTokenStoreContract } from "@miragon/bpmn-modeler-core/testing";

import { intellijCredentialHost } from "../../../__fixtures__/intellijCredentialHost";
import { RpcTokenStore } from "./RpcTokenStore";

describeTokenStoreContract(
    "RpcTokenStore answered as the IntelliJ host answers",
    async () => new RpcTokenStore(intellijCredentialHost()),
);
