import {
    applyDeploymentStatePatch,
    DEFAULT_DEPLOYMENT_STATE,
    DeploymentState,
    DeploymentStatePatch,
} from "../deployment/domain/deploymentState";
import { DeploymentStatePort } from "../deployment/domain/ports";

interface SaveFailure {
    readonly matches: (patch: DeploymentStatePatch) => boolean;
    readonly error: Error;
}

export class InMemoryDeploymentState implements DeploymentStatePort {
    private state: DeploymentState = DEFAULT_DEPLOYMENT_STATE;
    private failure: SaveFailure | undefined;

    /** What the host had stored before the test: unnamed fields keep their values. */
    seed(stored: Partial<DeploymentState>): void {
        this.state = { ...this.state, ...stored };
    }

    /** Every later save whose patch `matches` rejects with `error` and writes nothing. */
    failSaves(matches: (patch: DeploymentStatePatch) => boolean, error: Error): void {
        this.failure = { matches, error };
    }

    load(): DeploymentState {
        return this.state;
    }

    async save(patch: DeploymentStatePatch): Promise<void> {
        if (this.failure?.matches(patch)) throw this.failure.error;
        this.state = applyDeploymentStatePatch(this.state, patch);
    }
}
