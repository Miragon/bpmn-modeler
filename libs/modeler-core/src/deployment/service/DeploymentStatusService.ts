import { posix } from "path";

import {
    DeploymentStatePort,
    DocumentPort,
    NotifierPort,
    PickerPort,
    StatusBarPort,
} from "../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../shared/infrastructure/EditorSessionStore";
import {
    contentFingerprint,
    DeployedRevision,
    DeploymentTargetIdentity,
    freshnessFor,
    ledgerKeyFor,
    ledgerKeyPrefixFor,
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
        private readonly picker: PickerPort,
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
            origin: "local",
        };
        await this.deploymentState.saveDeployedRevision(ledgerKeyFor(identity, filePath), revision);
    }

    getRevision(
        filePath: string,
        identity: DeploymentTargetIdentity,
    ): DeployedRevision | undefined {
        return this.deploymentState.getDeployedRevision(ledgerKeyFor(identity, filePath));
    }

    async adoptRevision(
        filePath: string,
        identity: DeploymentTargetIdentity,
        revision: DeployedRevision,
    ): Promise<void> {
        await this.deploymentState.saveDeployedRevision(ledgerKeyFor(identity, filePath), revision);
    }

    async forgetRevision(filePath: string, identity: DeploymentTargetIdentity): Promise<void> {
        await this.deploymentState.deleteDeployedRevisions([ledgerKeyFor(identity, filePath)]);
    }

    /** Drops every ledger row of `identity` — target deleted or renamed. */
    async pruneTarget(identity: DeploymentTargetIdentity): Promise<void> {
        const prefix = ledgerKeyPrefixFor(identity);
        const keys = this.deploymentState.listLedgerKeys().filter((key) => key.startsWith(prefix));
        if (keys.length > 0) {
            await this.deploymentState.deleteDeployedRevisions(keys);
        }
    }

    /**
     * The status-bar item's click menu, shared by both hosts: offers switching
     * the target and — for a named Camunda 7 target — engine verification.
     */
    async pickStatusBarAction(documentDir?: string): Promise<"switch" | "verify" | undefined> {
        const target = await this.deploymentTargetService.getActiveTarget(documentDir);
        return this.picker.pickDeploymentStatusAction({
            targetName: target?.name,
            canVerify: target?.engine === "c7",
        });
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
            this.statusBar.showDeploymentTarget(
                target?.name,
                freshness,
                revision?.deployedAt,
                revision?.verifiedAt,
            );
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
