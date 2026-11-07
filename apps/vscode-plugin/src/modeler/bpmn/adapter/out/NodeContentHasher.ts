import { createHash } from "node:crypto";

import { ContentHasherPort } from "@miragon/bpmn-modeler-core";

export class NodeContentHasher implements ContentHasherPort {
    sha256(text: string): string {
        return createHash("sha256").update(text, "utf8").digest("hex");
    }
}
