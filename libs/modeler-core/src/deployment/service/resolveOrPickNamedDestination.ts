import { NamedDestination } from "../domain/deploymentDestination";
import { DeploymentTargetService } from "./DeploymentTargetService";

/**
 * The active target's destination, or — when none is set — the one the user
 * picks in the target picker. `undefined` means the user dismissed the picker
 * or chose ad-hoc mode.
 */
export async function resolveOrPickNamedDestination(
    deploymentTargetService: DeploymentTargetService,
    documentDir: string | undefined,
): Promise<NamedDestination | undefined> {
    const active = await deploymentTargetService.getActiveDestination(documentDir);
    if (active.kind === "named") {
        return active;
    }
    await deploymentTargetService.switchActiveTarget(documentDir);
    const picked = await deploymentTargetService.getActiveDestination(documentDir);
    return picked.kind === "named" ? picked : undefined;
}
