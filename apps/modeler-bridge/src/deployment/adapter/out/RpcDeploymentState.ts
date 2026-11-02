import { applyDeploymentStatePatch, DEFAULT_DEPLOYMENT_STATE, DeploymentState, DeploymentStatePatch, DeploymentStatePort, deploymentStateFrom, RawDeploymentState } from "@miragon/bpmn-modeler-core";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";
import { DeploymentStateMirror } from "../../port/DeploymentStateMirror";

/**
 * RPC-backed {@link DeploymentStatePort} with a local mirror.
 *
 * `load()` is synchronous, so the bridge cannot await an RPC per read.
 * Mirroring the {@link BridgeSettings} pattern: the host seeds what it stored
 * once on startup (`deploymentState/seed`) and `load()` reads the mirror, which
 * the core normalises.
 *
 * The host is the writer of record: `save` sends the patch as one
 * **acknowledged** `deploymentState/save` request and applies it to the mirror
 * only once the host accepted it, so a read never shows a value the host did
 * not store. A persist failure rejects, leaves the mirror as it was, and lets
 * the core decide what it means. Secrets are out of scope here — they ride
 * {@link RpcSecretStore} / PasswordSafe.
 */
export class RpcDeploymentState implements DeploymentStatePort, DeploymentStateMirror {
    private state: DeploymentState = DEFAULT_DEPLOYMENT_STATE;

    constructor(private readonly rpc: Rpc) {}

    /** Replaces the mirror with what the host stored (sent on startup / respawn). */
    seed(stored: RawDeploymentState): void {
        this.state = deploymentStateFrom(stored);
    }

    load(): DeploymentState {
        return this.state;
    }

    async save(patch: DeploymentStatePatch): Promise<void> {
        await this.rpc.request(METHODS.deploymentStateSave, { patch });
        // Patched onto the state at acceptance, not at send, so an overlapping save is kept.
        this.state = applyDeploymentStatePatch(this.state, patch);
    }
}
