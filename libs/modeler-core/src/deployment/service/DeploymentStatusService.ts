import { posix } from "path";

import {
    DeploymentStatePort,
    DocumentPort,
    NotifierPort,
    StatusBarPort,
} from "../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../shared/infrastructure/EditorSessionStore";
import {
    contentFingerprint,
    DeployedRevision,
    DeploymentTargetIdentity,
    freshnessFor,
    ledgerKeyFor,
} from "../domain/deploymentLedger";
import { DeploymentTargetService } from "./DeploymentTargetService";

/**
 * Owns the deployment status-bar item and the "what was last deployed where"
 * ledger. Split out of {@link DeploymentTargetService} (SRP) so that service
 * keeps only targets-file + credential concerns while this one renders the
 * coloured freshness dot and records revisions on a successful deploy.
 *
 * Freshness is decided entirely locally: it compares the active editor content
 * against the fingerprint stored at the last deploy to the active target. No
 * engine round-trip — a `unknown` (gray) dot means "no local record", never
 * "absent on the engine".
 */
export class DeploymentStatusService {
    private refreshGeneration = 0;

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly documentPort: DocumentPort,
        private readonly deploymentTargetService: DeploymentTargetService,
        private readonly deploymentState: DeploymentStatePort,
        private readonly statusBar: StatusBarPort,
        private readonly notifier: NotifierPort,
    ) {}

    async recordDeployment(
        filePath: string,
        content: string,
        identity: DeploymentTargetIdentity,
        deploymentId?: string,
    ): Promise<void> {
        const revision: DeployedRevision = {
            fingerprint: contentFingerprint(content),
            deployedAt: new Date().toISOString(),
            deploymentId,
        };
        await this.deploymentState.saveDeployedRevision(ledgerKeyFor(identity, filePath), revision);
    }

    /**
     * Re-renders the status bar for `editorId` from the ledger. A missing active
     * editor is the normal steady state, so any failure only logs at debug and
     * hides the item.
     */
    async refresh(editorId: string): Promise<void> {
        if (!this.isActive(editorId)) return;
        const generation = ++this.refreshGeneration;
        try {
            const filePath = this.documentPort.getFilePath(editorId);
            const documentDir = posix.dirname(filePath);
            const target = await this.deploymentTargetService.getActiveTarget(documentDir);
            if (generation !== this.refreshGeneration || !this.isActive(editorId)) return;
            const identity =
                target !== undefined
                    ? DeploymentTargetIdentity.fromTarget(target)
                    : DeploymentTargetIdentity.adHoc(
                          this.deploymentState.getEndpoint(),
                          this.deploymentState.getTenantId(),
                      );

            const revision = this.deploymentState.getDeployedRevision(
                ledgerKeyFor(identity, filePath),
            );
            const freshness = freshnessFor(revision, this.documentPort.getContent(editorId));
            this.statusBar.showDeploymentTarget(target?.name, freshness, revision?.deployedAt);
        } catch (error) {
            this.notifier.logDebug(
                `Deployment status refresh skipped: ${(error as Error).message}`,
            );
            if (generation === this.refreshGeneration && this.isActive(editorId)) this.hide();
        }
    }

    async refreshActive(): Promise<void> {
        try {
            await this.refresh(this.editorStore.getActiveEditorId());
        } catch (error) {
            this.hide();
            this.notifier.logDebug(
                `No active editor for deployment status: ${(error as Error).message}`,
            );
        }
    }

    hide(): void {
        this.refreshGeneration++;
        this.statusBar.hideDeploymentTarget();
    }

    private isActive(editorId: string): boolean {
        try {
            return this.editorStore.getActiveEditorId() === editorId;
        } catch {
            return false;
        }
    }
}
