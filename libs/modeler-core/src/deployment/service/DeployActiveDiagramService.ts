import { posix } from "path";

import { DocumentPort, NotifierPort } from "../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../shared/infrastructure/EditorSessionStore";
import { DeploymentService } from "./DeploymentService";
import { DeploymentStatusService } from "./DeploymentStatusService";
import { DeploymentTargetService } from "./DeploymentTargetService";

const DEPLOYABLE_EXTENSIONS = [".bpmn", ".dmn"];

/**
 * One-click deploy of the active editor's diagram to the active target (ADR
 * 0038). Saves first, then reuses {@link DeploymentService.deployFiles} so the
 * ledger record and summary notification match the sidebar path. Split from the
 * sidebar dispatcher (SRP): this owns only the "deploy what's on screen" flow.
 */
export class DeployActiveDiagramService {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly documentPort: DocumentPort,
        private readonly deploymentTargetService: DeploymentTargetService,
        private readonly deploymentService: DeploymentService,
        private readonly deploymentStatusService: DeploymentStatusService,
        private readonly notifier: NotifierPort,
    ) {}

    /**
     * Saves and deploys the active diagram to the active target. With no active
     * target, runs the target picker first (mirroring `deployFiles`) and proceeds
     * only if a concrete target results.
     */
    async deployActive(documentDir?: string): Promise<void> {
        let editorId: string;
        try {
            editorId = this.editorStore.getActiveEditorId();
        } catch {
            this.notifier.showInfo("Open a BPMN or DMN diagram to deploy it.");
            return;
        }

        const filePath = this.documentPort.getFilePath(editorId);
        if (!DEPLOYABLE_EXTENSIONS.includes(posix.extname(filePath).toLowerCase())) {
            this.notifier.showInfo("Open a BPMN or DMN diagram to deploy it.");
            return;
        }

        const dir = documentDir ?? posix.dirname(filePath);
        let target = await this.deploymentTargetService.getActiveTarget(dir);
        if (target === undefined) {
            await this.deploymentTargetService.switchActiveTarget(dir);
            await this.deploymentStatusService.refreshActive();
            target = await this.deploymentTargetService.getActiveTarget(dir);
            if (target === undefined) {
                return;
            }
        }

        // save() returns false for an unmodified document (nothing to persist);
        // only a throw is a real save failure worth aborting for.
        try {
            await this.documentPort.save(editorId);
        } catch (error) {
            this.notifier.showError(
                `Could not save the diagram before deploying: ${(error as Error).message}`,
            );
            return;
        }

        const resolvedTarget = target;
        const name = posix.basename(filePath);
        const auth = await this.deploymentTargetService.getCredentials(target, dir);
        await this.notifier.withProgress(`Deploying ${name} to "${target.name}"`, () =>
            this.deploymentService.deployFiles([filePath], resolvedTarget, auth),
        );
        await this.deploymentStatusService.refreshActive();
    }
}
