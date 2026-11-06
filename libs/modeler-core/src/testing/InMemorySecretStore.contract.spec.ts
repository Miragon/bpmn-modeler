import { InMemorySecretStore } from "./InMemoryCredentials";
import { describeSecretStoreContract } from "./secretStoreContract";

describeSecretStoreContract("InMemorySecretStore", async () => new InMemorySecretStore());
