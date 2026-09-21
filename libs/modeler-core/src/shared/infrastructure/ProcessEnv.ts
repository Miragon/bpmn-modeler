import { EnvPort } from "../domain/hostPorts";

/**
 * {@link EnvPort} over Node's `process.env`. The core already ships Node-flavored
 * infrastructure (FetchHttpClient, Buffer in BasicAuth); this one runs unmodified
 * under both the VS Code extension host and the Bun bridge.
 */
export class ProcessEnv implements EnvPort {
    get(name: string): string | undefined {
        return process.env[name];
    }
}
