import { posix } from "path";

import {
    DocumentPort,
    NotifierPort,
    SettingsPort,
    StatusBarPort,
} from "../../kernel/domain/hostPorts";
import { UnreadableDotEnvError } from "../domain/errors";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import {
    contentFingerprint,
    DeployedRevision,
    DeploymentTargetIdentity,
    freshnessFor,
    ledgerKeyFor,
    ledgerKeyPrefixFor,
} from "../domain/deploymentLedger";
import { DeploymentDestination } from "../domain/deploymentDestination";
import { DeploymentTargetsEvent } from "../domain/deploymentTargetsEvent";
import { deploymentStatusView, timestampFormatter } from "../domain/deploymentStatusView";
import { EnvLookup, NO_ENV_VARIABLES } from "../domain/envRef";
import { DeploymentPickerPort, DeploymentStatePort } from "../domain/ports";
import { DeploymentTargetService } from "./DeploymentTargetService";
import { EnvValueResolver } from "./EnvValueResolver";

/**
 * Owns the deployment status-bar item and the "what was last deployed where"
 * ledger. Split out of {@link DeploymentTargetService} (SRP) so that service
 * keeps only targets-file + credential concerns while this one renders the
 * coloured freshness dot and records revisions on a successful deploy.
 *
 * Freshness is decided entirely locally: it compares the focused editor's content
 * against the fingerprint stored at the last deploy to the active target. No
 * engine round-trip — a `unknown` (gray) dot means "no local record", never
 * "absent on the engine".
 */
export class DeploymentStatusService {
    private refreshGeneration = 0;
    /** Sessions whose participant hides the item on blur and close (BPMN, not DMN or Form). */
    private readonly trackedEditorIds = new Set<string>();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly documentPort: DocumentPort,
        private readonly deploymentTargetService: DeploymentTargetService,
        private readonly deploymentState: DeploymentStatePort,
        private readonly statusBar: StatusBarPort,
        private readonly picker: DeploymentPickerPort,
        private readonly notifier: NotifierPort,
        private readonly envResolver: EnvValueResolver,
        private readonly settings: SettingsPort,
    ) {}

    async ledgerIdentity(
        destination: DeploymentDestination,
        documentDir?: string,
    ): Promise<DeploymentTargetIdentity> {
        return destination.ledgerIdentity(await this.identityLookup(destination, documentDir));
    }

    /**
     * An unreadable `.env` must not fail a status refresh or a ledger prune that
     * runs after a target was already saved; unresolved refs then stay verbatim.
     */
    private async identityLookup(
        destination: DeploymentDestination,
        documentDir: string | undefined,
    ): Promise<EnvLookup> {
        try {
            return await this.envResolver.createLookup(
                destination,
                documentDir,
                destination.ledgerEnvRefs(),
            );
        } catch (error) {
            if (error instanceof UnreadableDotEnvError) {
                this.notifier.logDebug(`Deployment status keyed without .env: ${error.message}`);
                return NO_ENV_VARIABLES;
            }
            throw error;
        }
    }

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
        await this.putRevision(ledgerKeyFor(identity, filePath), revision);
    }

    getRevision(
        filePath: string,
        identity: DeploymentTargetIdentity,
    ): DeployedRevision | undefined {
        return this.deploymentState.load().ledger[ledgerKeyFor(identity, filePath)];
    }

    async adoptRevision(
        filePath: string,
        identity: DeploymentTargetIdentity,
        revision: DeployedRevision,
    ): Promise<void> {
        await this.putRevision(ledgerKeyFor(identity, filePath), revision);
    }

    private async putRevision(ledgerKey: string, revision: DeployedRevision): Promise<void> {
        await this.writeThenRefresh(() =>
            this.deploymentState.save({ ledger: { put: { [ledgerKey]: revision } } }),
        );
    }

    async forgetRevision(filePath: string, identity: DeploymentTargetIdentity): Promise<void> {
        await this.writeThenRefresh(() =>
            this.deploymentState.save({
                ledger: { remove: [ledgerKeyFor(identity, filePath)] },
            }),
        );
    }

    /** Drops every ledger row of `identity` — target deleted or renamed. */
    async pruneTarget(identity: DeploymentTargetIdentity): Promise<void> {
        const prefix = ledgerKeyPrefixFor(identity);
        await this.writeThenRefresh(async () => {
            const keys = Object.keys(this.deploymentState.load().ledger).filter((key) =>
                key.startsWith(prefix),
            );
            if (keys.length > 0) {
                await this.deploymentState.save({ ledger: { remove: keys } });
            }
        });
    }

    async targetsChanged(event: DeploymentTargetsEvent): Promise<void> {
        const retired = event.kind === "targetsChanged" ? event.edit.retiredDestination : undefined;
        if (event.kind === "targetsChanged" && retired !== undefined) {
            // The prune refreshes the item.
            await this.pruneTarget(await this.ledgerIdentity(retired, event.documentDir));
        } else {
            await this.refreshFocused();
        }
    }

    private async writeThenRefresh(writeLedger: () => Promise<void>): Promise<void> {
        try {
            await writeLedger();
        } finally {
            // Even after a failed write: an ad-hoc deploy first saves the connection the item reads.
            await this.refreshFocused();
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
        if (!this.editorStore.isFocused(editorId)) return;
        const generation = ++this.refreshGeneration;
        try {
            const filePath = this.documentPort.getFilePath(editorId);
            const documentDir = posix.dirname(filePath);
            const destination =
                await this.deploymentTargetService.getActiveDestination(documentDir);
            const identity = await this.ledgerIdentity(destination, documentDir);
            if (generation !== this.refreshGeneration || !this.editorStore.isFocused(editorId)) {
                return;
            }

            const revision = this.deploymentState.load().ledger[ledgerKeyFor(identity, filePath)];
            this.statusBar.show(
                "deploymentTarget",
                deploymentStatusView(
                    {
                        connection: destination.statusConnection,
                        freshness: freshnessFor(revision, this.documentPort.getContent(editorId)),
                        deployedAt: revision?.deployedAt,
                        verifiedAt: revision?.verifiedAt,
                    },
                    timestampFormatter(this.settings.getLanguage()),
                ),
            );
        } catch (error) {
            this.notifier.logDebug(
                `Deployment status refresh skipped: ${(error as Error).message}`,
            );
            if (generation === this.refreshGeneration && this.editorStore.isFocused(editorId)) {
                this.hide();
            }
        }
    }

    track(editorId: string): void {
        this.trackedEditorIds.add(editorId);
    }

    untrack(editorId: string): void {
        this.trackedEditorIds.delete(editorId);
    }

    async refreshFocused(): Promise<void> {
        const focusedEditorId = this.editorStore.getFocusedEditorId();
        if (focusedEditorId !== undefined && this.trackedEditorIds.has(focusedEditorId)) {
            await this.refresh(focusedEditorId);
        } else {
            this.hide();
        }
    }

    hide(): void {
        this.refreshGeneration++;
        this.statusBar.hide("deploymentTarget");
    }
}
