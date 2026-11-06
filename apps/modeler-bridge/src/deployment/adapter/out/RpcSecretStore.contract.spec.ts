import { describeSecretStoreContract } from "@miragon/bpmn-modeler-core/testing";

import { intellijCredentialHost } from "../../../__fixtures__/intellijCredentialHost";
import { RpcSecretStore } from "./RpcSecretStore";

describeSecretStoreContract(
    "RpcSecretStore answered as the IntelliJ host answers",
    async () => new RpcSecretStore(intellijCredentialHost()),
);
