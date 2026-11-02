import { RawDeploymentState } from "@miragon/bpmn-modeler-core";

/** Takes the host's stored deployment state, which the state port then answers from. */
export interface DeploymentStateMirror {
    seed(stored: RawDeploymentState): void;
}
