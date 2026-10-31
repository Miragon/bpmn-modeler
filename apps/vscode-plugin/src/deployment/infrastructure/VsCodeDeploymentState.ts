import { Memento } from "vscode";

import {
    applyDeploymentStatePatch,
    DeploymentState,
    DeploymentStatePatch,
    DeploymentStatePort,
    deploymentStateFrom,
    patchedKeys,
} from "@miragon/bpmn-modeler-core";

/** The keys earlier releases wrote; renaming one would forget the stored value. */
const MEMENTO_KEYS: Readonly<Record<keyof DeploymentState, string>> = {
    endpoint: "bpmn-modeler.deployment.endpoint",
    tenantId: "bpmn-modeler.deployment.tenantId",
    authType: "bpmn-modeler.deployment.authType",
    tokenEndpoint: "bpmn-modeler.deployment.tokenEndpoint",
    audience: "bpmn-modeler.deployment.audience",
    activeTargetName: "bpmn-modeler.deployment.activeTargetName",
    ledger: "bpmn-modeler.deployment.ledger",
};

/** Persists the deployment state in the extension's per-project `workspaceState`. */
export class VsCodeDeploymentState implements DeploymentStatePort {
    constructor(private readonly workspaceState: Memento) {}

    load(): DeploymentState {
        return deploymentStateFrom({
            endpoint: this.workspaceState.get(MEMENTO_KEYS.endpoint),
            tenantId: this.workspaceState.get(MEMENTO_KEYS.tenantId),
            authType: this.workspaceState.get(MEMENTO_KEYS.authType),
            tokenEndpoint: this.workspaceState.get(MEMENTO_KEYS.tokenEndpoint),
            audience: this.workspaceState.get(MEMENTO_KEYS.audience),
            activeTargetName: this.workspaceState.get(MEMENTO_KEYS.activeTargetName),
            ledger: this.workspaceState.get(MEMENTO_KEYS.ledger),
        });
    }

    async save(patch: DeploymentStatePatch): Promise<void> {
        const next = applyDeploymentStatePatch(this.load(), patch);
        for (const key of patchedKeys(patch)) {
            await this.workspaceState.update(MEMENTO_KEYS[key], next[key]);
        }
    }
}
