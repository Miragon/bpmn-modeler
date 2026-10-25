import { randomFillSync } from "node:crypto";

import { getNonce } from "@miragon/bpmn-modeler-core";

// Node's own CSPRNG: extension hosts before VS Code 1.90 run Node 16 without a global Web Crypto.
export function createWebviewNonce(): string {
    return getNonce((bytes) => randomFillSync(bytes));
}
