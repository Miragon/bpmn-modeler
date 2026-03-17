import { DeploymentConfig, DeploymentResult } from "../../domain/deployment";
import { CamundaEnginePort } from "../../domain/ports";
import { StartInstanceConfig, StartInstanceResult } from "../../domain/startInstance";

/**
 * Dispatches {@link CamundaEnginePort} calls to the correct engine-specific
 * implementation based on the `engine` field of each request config.
 *
 * This thin router exists because the engine choice is per-request (carried
 * on the config objects), not per-client instance.
 */
export class CamundaEngineRouter implements CamundaEnginePort {
    /**
     * @param c7 Camunda 7 REST client implementation.
     * @param c8 Camunda 8 REST client implementation.
     */
    constructor(
        private readonly c7: CamundaEnginePort,
        private readonly c8: CamundaEnginePort,
    ) {}

    /**
     * Routes the deployment request to the C7 or C8 client.
     *
     * @param config Validated deployment configuration (includes `engine`).
     * @param fileContents Map of filename → UTF-8 file content.
     * @returns The deployment result from the selected engine client.
     */
    deploy(
        config: DeploymentConfig,
        fileContents: Map<string, string>,
    ): Promise<DeploymentResult> {
        return (config.engine === "c7" ? this.c7 : this.c8).deploy(config, fileContents);
    }

    /**
     * Routes the start-instance request to the C7 or C8 client.
     *
     * @param config Validated start-instance configuration (includes `engine`).
     * @returns The start-instance result from the selected engine client.
     */
    startInstance(config: StartInstanceConfig): Promise<StartInstanceResult> {
        return (config.engine === "c7" ? this.c7 : this.c8).startInstance(config);
    }
}
