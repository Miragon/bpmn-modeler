import { posix } from "path";

import { DocumentPort, NotifierPort } from "../../kernel/domain/hostPorts";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { DeploymentService } from "./DeploymentService";
import { DeploymentStatusService } from "./DeploymentStatusService";
import { DeploymentTargetService } from "./DeploymentTargetService";
import { resolveOrPickActiveTarget } from "./resolveOrPickActiveTarget";
import { SaveBeforeDeploy } from "./SaveBeforeDeploy";

const DEPLOYABLE_EXTENSIONS = [".bpmn", ".dmn"];

/**
 * One-click deploy of the active editor's diagram to the active target. Saves
 * what the editor shows first, then reuses {@link DeploymentService.deployFiles},
 * which reads the file from disk, so the ledger record and summary notification
 * match the sidebar path. Split from the sidebar dispatcher (SRP): this owns
 * only the "deploy what's on screen" flow.
 */
export class DeployActiveDiagramService {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly documentPort: DocumentPort,
        private readonly deploymentTargetService: DeploymentTargetService,
        private readonly deploymentService: DeploymentService,
        private readonly deploymentStatusService: DeploymentStatusService,
        private readonly notifier: NotifierPort,
        private readonly saveBeforeDeploy: SaveBeforeDeploy,
    ) {}

    /**
     * Flushes, saves and deploys the active diagram to the active target. With
     * no active target, runs the target picker first (mirroring `deployFiles`)
     * and proceeds only if a concrete target results.
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
        const target = await resolveOrPickActiveTarget(
            this.deploymentTargetService,
            this.deploymentStatusService,
            dir,
        );
        if (target === undefined) {
            return;
        }

        const saveResult = await this.saveBeforeDeploy.save(editorId);
        if (!saveResult.saved) {
            this.notifier.showError(saveResult.message);
            return;
        }

        const name = posix.basename(filePath);
        const auth = await this.deploymentTargetService.getCredentials(target, dir);
        await this.notifier.withProgress(`Deploying ${name} to "${target.name}"`, () =>
            this.deploymentService.deployFiles([filePath], target, auth, dir),
        );
        await this.deploymentStatusService.refreshFocused();
    }
}
