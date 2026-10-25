import { DeploymentTarget } from "../domain/deploymentTarget";
import { DeploymentStatusService } from "./DeploymentStatusService";
import { DeploymentTargetService } from "./DeploymentTargetService";

/**
 * The active target, or — when none is set — whatever the user picks in the
 * target picker. `undefined` means the user dismissed the picker or chose ad-hoc mode.
 */
export async function resolveOrPickActiveTarget(
    deploymentTargetService: DeploymentTargetService,
    deploymentStatusService: DeploymentStatusService,
    documentDir: string | undefined,
    afterTargetPicker: () => Promise<void> = async () => undefined,
): Promise<DeploymentTarget | undefined> {
    const activeTarget = await deploymentTargetService.getActiveTarget(documentDir);
    if (activeTarget !== undefined) {
        return activeTarget;
    }
    await deploymentTargetService.switchActiveTarget(documentDir);
    await deploymentStatusService.refreshActive();
    await afterTargetPicker();
    return deploymentTargetService.getActiveTarget(documentDir);
}
