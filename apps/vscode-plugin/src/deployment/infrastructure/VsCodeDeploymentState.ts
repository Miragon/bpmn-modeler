import { Memento } from "vscode";

import {
    applyDeploymentStatePatch,
    DeploymentState,
    DeploymentStatePatch,
    DeploymentStatePort,
    deploymentStateFrom,
    RawDeploymentState,
} from "@miragon/bpmn-modeler-core";

/** One key, because an update of one `Memento` key is its only write that is all or nothing. */
const STATE_KEY = "bpmn-modeler.deployment.state";

/** The per-field keys earlier releases wrote, read until the first save writes `STATE_KEY`. */
const LEGACY_KEYS: Readonly<Record<keyof DeploymentState, string>> = {
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
        return deploymentStateFrom(
            this.workspaceState.get<RawDeploymentState>(STATE_KEY) ?? this.legacyState(),
        );
    }

    async save(patch: DeploymentStatePatch): Promise<void> {
        await this.workspaceState.update(STATE_KEY, applyDeploymentStatePatch(this.load(), patch));
    }

    private legacyState(): RawDeploymentState {
        return Object.fromEntries(
            Object.entries(LEGACY_KEYS).map(([field, key]) => [
                field,
                this.workspaceState.get(key),
            ]),
        );
    }
}
