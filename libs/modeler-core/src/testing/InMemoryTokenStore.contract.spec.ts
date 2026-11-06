import { InMemoryTokenStore } from "./InMemoryCredentials";
import { describeTokenStoreContract } from "./tokenStoreContract";

describeTokenStoreContract("InMemoryTokenStore", async () => new InMemoryTokenStore());
