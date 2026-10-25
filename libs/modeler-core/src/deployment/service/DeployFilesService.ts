import { NotifierPort, PickerPort } from "../../shared/domain/hostPorts";
import { DeploymentService } from "./DeploymentService";
import { DeploymentStatusService } from "./DeploymentStatusService";
import { DeploymentTargetService } from "./DeploymentTargetService";
import { resolveOrPickActiveTarget } from "./resolveOrPickActiveTarget";

const DEPLOYABLE_FILES_GLOB = "**/*.{bpmn,dmn}";
const DEPENDENCY_FOLDERS_GLOB = "**/node_modules/**";

/**
 * Deploys a multi-select set of workspace BPMN/DMN files to the active target —
 * the "Deploy Files…" command every host offers.
 */
export class DeployFilesService {
    constructor(
        private readonly deploymentTargetService: DeploymentTargetService,
        private readonly deploymentService: DeploymentService,
        private readonly deploymentStatusService: DeploymentStatusService,
        private readonly picker: PickerPort,
        private readonly notifier: NotifierPort,
    ) {}

    /**
     * With no active target the target picker runs first and the flow continues
     * only if a target results. `afterTargetPicker` lets the host mirror the
     * picker's outcome into an open deployment sidebar before files are chosen.
     */
    async deployFiles(
        documentDir: string | undefined,
        afterTargetPicker?: () => Promise<void>,
    ): Promise<void> {
        const target = await resolveOrPickActiveTarget(
            this.deploymentTargetService,
            this.deploymentStatusService,
            documentDir,
            afterTargetPicker,
        );
        if (target === undefined) {
            return;
        }

        const files = await this.picker.pickWorkspaceFiles({
            glob: DEPLOYABLE_FILES_GLOB,
            exclude: DEPENDENCY_FOLDERS_GLOB,
            placeholder: `Select files to deploy to "${target.name}"`,
        });
        if (files.length === 0) {
            return;
        }

        const auth = await this.deploymentTargetService.getCredentials(target, documentDir);
        await this.notifier.withProgress(
            `Deploying ${files.length} file(s) to "${target.name}"`,
            () => this.deploymentService.deployFiles(files, target, auth, documentDir),
        );
        await this.deploymentStatusService.refreshActive();
    }
}
