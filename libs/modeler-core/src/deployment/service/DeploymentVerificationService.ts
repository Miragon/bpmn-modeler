import { posix } from "path";

import { BpmnDocument } from "../../kernel/domain/BpmnDocument";
import { UserCancelledError } from "../../kernel/domain/errors";
import {
    CredentialDestinationError,
    EngineInspectionFailedError,
    EnvReferenceError,
} from "../domain/errors";
import { DocumentPort, NotifierPort } from "../../kernel/domain/hostPorts";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { reconcile } from "../domain/deploymentVerification";
import { EngineInspectionPort } from "../domain/ports";
import { sensitiveDestinations } from "../domain/deployment";
import { recordingLookup } from "../domain/envRef";
import { CredentialApprovalService } from "./CredentialApprovalService";
import { DeploymentStatusService } from "./DeploymentStatusService";
import { DeploymentTargetService } from "./DeploymentTargetService";
import { EnvValueResolver } from "./EnvValueResolver";

/**
 * On-demand reconciliation of the local deployment ledger against a Camunda 7
 * engine (see docs/adr/deployment.md#engine-reconciliation). Split from
 * {@link DeploymentStatusService}: that service owns the ledger and the status
 * bar, this one owns the REST lookup and
 * the reconcile → ledger-write mapping. Never automatic — only the palette
 * command and the status-bar menu call it.
 */
export class DeploymentVerificationService {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly documentPort: DocumentPort,
        private readonly deploymentTargetService: DeploymentTargetService,
        private readonly deploymentStatusService: DeploymentStatusService,
        private readonly inspection: EngineInspectionPort,
        private readonly notifier: NotifierPort,
        private readonly envResolver: EnvValueResolver,
        private readonly credentialApproval: CredentialApprovalService,
    ) {}

    /**
     * Verifies the active editor's diagram against the active target's engine
     * and reconciles the ledger row. Errors never touch the ledger.
     *
     * @throws {UserCancelledError} when the user cancels a prompt: a dismissal,
     *   not a failed verification, so it is not reported here.
     */
    async verifyActive(documentDir?: string): Promise<void> {
        let editorId: string;
        try {
            editorId = this.editorStore.getActiveEditorId();
        } catch {
            this.notifier.showInfo("Open a BPMN diagram to verify its deployment.");
            return;
        }
        const filePath = this.documentPort.getFilePath(editorId);
        const content = this.documentPort.getContent(editorId);

        const dir = documentDir ?? posix.dirname(filePath);
        const destination = await this.deploymentTargetService.getActiveDestination(dir);
        if (destination.kind === "adHoc") {
            this.notifier.showInfo("Select a named Camunda 7 target to verify against.");
            return;
        }
        const { target } = destination;
        if (target.engine !== "c7") {
            this.notifier.showInfo("Verification is not available for Camunda 8 targets.");
            return;
        }

        let processKey: string;
        try {
            processKey = new BpmnDocument(content).extractProcessId();
        } catch (error) {
            this.notifier.showError((error as Error).message);
            return;
        }

        try {
            const credentials = await this.deploymentTargetService.getCredentials(destination);
            const lookup = await this.envResolver.createLookup(
                destination,
                dir,
                target.connectionEnvRefs(),
                credentials,
            );
            const recording = recordingLookup(lookup);
            const auth = credentials.expandEnvRefs(recording);
            const { endpoint, tenantId } = target.expandConnection(recording);
            const envValues = [...recording.resolved];
            await this.credentialApproval.ensureApproved(
                destination,
                sensitiveDestinations(endpoint, auth, envValues),
            );
            const snapshot = await this.notifier.withProgress(
                `Verifying on "${target.name}"…`,
                () =>
                    this.inspection.fetchLatestDefinition({
                        endpoint,
                        tenantId,
                        processKey,
                        auth,
                        envValues,
                    }),
            );

            const identity = destination.ledgerIdentity(lookup);
            const recorded = this.deploymentStatusService.getRevision(filePath, identity);
            const { outcome, revision } = reconcile(recorded, content, snapshot);

            if (revision !== undefined) {
                await this.deploymentStatusService.adoptRevision(filePath, identity, revision);
            } else {
                await this.deploymentStatusService.forgetRevision(filePath, identity);
            }

            const deployedTime = timeOf(revision?.deployedAt);
            const reportedDeploymentTime = timeOf(snapshot?.deploymentTime);
            switch (outcome) {
                case "current":
                    this.notifier.showInfo(
                        `Verified: ${target.name} runs your last deployment${deployedTime ? ` (${deployedTime})` : ""}.`,
                    );
                    break;
                case "adopted":
                    this.notifier.showInfo(
                        `Verified: ${target.name} runs exactly this diagram${deployedTime ? ` (deployed ${deployedTime})` : ""}.`,
                    );
                    break;
                case "superseded":
                    this.notifier.showInfo(
                        `The version deployed on ${target.name}${reportedDeploymentTime ? ` (deployed ${reportedDeploymentTime})` : ""} differs from your diagram.`,
                    );
                    break;
                case "missing":
                    this.notifier.showInfo(
                        `Process '${processKey}' is not deployed on ${target.name}.`,
                    );
                    break;
            }
        } catch (error) {
            if (error instanceof UserCancelledError) throw error;
            if (error instanceof EngineInspectionFailedError && error.isAuthFailure) {
                this.notifier.showError(
                    `Could not verify deployment on "${target.name}" — check the target credentials.`,
                );
                return;
            }
            if (error instanceof EnvReferenceError || error instanceof CredentialDestinationError) {
                this.notifier.showError(error.message);
                return;
            }
            this.notifier.notifyError(
                "Could not verify deployment",
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }
}

function timeOf(iso: string | undefined): string | undefined {
    if (iso === undefined) return undefined;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
