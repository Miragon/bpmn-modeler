import { Engine } from "@miragon/bpmn-modeler-types";

import { DeploymentConfig, DeploymentResult } from "../../../domain/deployment";
import { CamundaEnginePort } from "../../../port/deploymentPorts";
import { StartInstanceConfig, StartInstanceResult } from "../../../domain/startInstance";

/**
 * Dispatches {@link CamundaEnginePort} calls to the correct engine-specific
 * implementation based on the `engine` field of each request config.
 *
 * This thin router exists because the engine choice is per-request (carried
 * on the config objects), not per-client instance.
 */
export class CamundaEngineRouter implements CamundaEnginePort {
    /** @param clients One REST client per engine. */
    constructor(private readonly clients: Readonly<Record<Engine, CamundaEnginePort>>) {}

    /**
     * Routes the deployment request to the client of its engine.
     *
     * @param config Validated deployment configuration (includes `engine`).
     * @param fileContents Map of filename → UTF-8 file content.
     * @returns The deployment result from the selected engine client.
     */
    deploy(config: DeploymentConfig, fileContents: Map<string, string>): Promise<DeploymentResult> {
        return this.clients[config.engine].deploy(config, fileContents);
    }

    /**
     * Routes the start-instance request to the client of its engine.
     *
     * @param config Validated start-instance configuration (includes `engine`).
     * @returns The start-instance result from the selected engine client.
     */
    startInstance(config: StartInstanceConfig): Promise<StartInstanceResult> {
        return this.clients[config.engine].startInstance(config);
    }
}
