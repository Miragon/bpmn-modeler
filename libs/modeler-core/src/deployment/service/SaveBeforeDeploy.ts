import { DocumentPort } from "../../kernel/domain/hostPorts";
import { PendingEditsFlush } from "../../shared/service/PendingEditsFlush";

export type SaveBeforeDeployResult = { saved: true } | { saved: false; message: string };

/** A deploy reads the file from disk, so what the editor shows must be persisted first. */
export class SaveBeforeDeploy {
    constructor(
        private readonly documentPort: DocumentPort,
        private readonly pendingEdits: Pick<PendingEditsFlush, "flushIntoDocument">,
    ) {}

    async save(editorId: string): Promise<SaveBeforeDeployResult> {
        // Best effort, as on a host save: without a confirmed flush the document
        // still holds every edit the webview synced before.
        await this.pendingEdits.flushIntoDocument(editorId);

        // save() returns false for an unmodified document (nothing to persist);
        // only a throw is a real save failure worth aborting for.
        try {
            await this.documentPort.save(editorId);
            return { saved: true };
        } catch (error) {
            return {
                saved: false,
                message: `Could not save the diagram before deploying: ${(error as Error).message}`,
            };
        }
    }
}
