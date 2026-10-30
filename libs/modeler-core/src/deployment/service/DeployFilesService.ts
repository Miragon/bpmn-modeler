import { NotifierPort, PickerPort } from "../../kernel/domain/hostPorts";
import { DeploymentService } from "./DeploymentService";
import { DeploymentTargetService } from "./DeploymentTargetService";
import { resolveOrPickNamedDestination } from "./resolveOrPickNamedDestination";

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
        private readonly picker: PickerPort,
        private readonly notifier: NotifierPort,
    ) {}

    /**
     * With no active target the target picker runs first and the flow continues
     * only if a target results.
     */
    async deployFiles(documentDir: string | undefined): Promise<void> {
        const destination = await resolveOrPickNamedDestination(
            this.deploymentTargetService,
            documentDir,
        );
        if (destination === undefined) {
            return;
        }
        const { target } = destination;

        const files = await this.picker.pickWorkspaceFiles({
            glob: DEPLOYABLE_FILES_GLOB,
            exclude: DEPENDENCY_FOLDERS_GLOB,
            placeholder: `Select files to deploy to "${target.name}"`,
        });
        if (files.length === 0) {
            return;
        }

        const auth = await this.deploymentTargetService.getCredentials(destination);
        await this.notifier.withProgress(
            `Deploying ${files.length} file(s) to "${target.name}"`,
            () => this.deploymentService.deployFiles(files, destination, auth, documentDir),
        );
    }
}
