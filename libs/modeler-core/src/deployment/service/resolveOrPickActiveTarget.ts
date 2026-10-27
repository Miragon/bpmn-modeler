import { NamedDestination } from "../domain/deploymentDestination";
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
): Promise<NamedDestination | undefined> {
    const active = await deploymentTargetService.getActiveDestination(documentDir);
    if (active.kind === "named") {
        return active;
    }
    await deploymentTargetService.switchActiveTarget(documentDir);
    await deploymentStatusService.refreshFocused();
    await afterTargetPicker();
    const picked = await deploymentTargetService.getActiveDestination(documentDir);
    return picked.kind === "named" ? picked : undefined;
}
