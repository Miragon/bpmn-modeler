import { randomFillSync } from "node:crypto";

import { getNonce } from "@miragon/bpmn-modeler-core";

export function createWebviewNonce(): string {
    return getNonce((bytes) => randomFillSync(bytes));
}
