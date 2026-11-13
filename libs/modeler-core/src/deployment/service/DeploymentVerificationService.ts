import { posix } from "path";

import { ENGINE_LABEL } from "@miragon/bpmn-modeler-types";

import { BpmnDocument } from "../../kernel/domain/BpmnDocument";
import { UserCancelledError } from "../../kernel/domain/errors";
import { NotifierPort } from "../../kernel/port/hostPorts";
import { EditorSessionDocuments } from "../../editorSession/service/EditorSessionDocuments";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import {
    reconcile,
    verificationFailureNotice,
    verificationMessage,
} from "../domain/deploymentVerification";
import { InspectionRequest } from "../domain/inspectionRequest";
import { EngineInspectionPort } from "../port/deploymentPorts";
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
        private readonly documents: EditorSessionDocuments,
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
        const filePath = this.documents.getFilePath(editorId);
        const content = this.documents.getContent(editorId);

        const dir = documentDir ?? posix.dirname(filePath);
        const destination = await this.deploymentTargetService.getActiveDestination(dir);
        if (destination.kind === "adHoc") {
            this.notifier.showInfo("Select a named Camunda 7 target to verify against.");
            return;
        }
        const { target } = destination;
        if (!target.verifiesDeployments()) {
            this.notifier.showInfo(
                `Verification is not available for ${ENGINE_LABEL[target.engine]} targets.`,
            );
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
            const literalRequest = new InspectionRequest(
                target.endpoint,
                target.tenantId,
                processKey,
                credentials,
            );
            const lookup = await this.envResolver.createLookup(destination, dir, literalRequest);
            const request = literalRequest.expandEnvRefs(lookup);
            await this.credentialApproval.ensureApproved(
                destination,
                request.sensitiveDestinations(),
            );
            const snapshot = await this.notifier.withProgress(
                `Verifying on "${target.name}"…`,
                () => this.inspection.fetchLatestDefinition(request),
            );

            const identity = destination.ledgerIdentity(lookup);
            const recorded = this.deploymentStatusService.getRevision(filePath, identity);
            const { outcome, revision } = reconcile(recorded, content, snapshot);

            if (revision !== undefined) {
                await this.deploymentStatusService.adoptRevision(filePath, identity, revision);
            } else {
                await this.deploymentStatusService.forgetRevision(filePath, identity);
            }

            this.notifier.showInfo(
                verificationMessage(outcome, {
                    targetName: target.name,
                    processKey,
                    revision,
                    snapshot,
                }),
            );
        } catch (error) {
            if (error instanceof UserCancelledError) throw error;
            const notice = verificationFailureNotice(error, target.name);
            if (notice.kind === "explained") {
                this.notifier.showError(notice.message);
            } else {
                this.notifier.notifyError(
                    notice.title,
                    error instanceof Error ? error : new Error(String(error)),
                );
            }
        }
    }
}
