import { EnvPort } from "../domain/hostPorts";

/** Lives in the core because both the extension host and the Bun bridge expose `process.env`. */
export class ProcessEnv implements EnvPort {
    get(name: string): string | undefined {
        return process.env[name];
    }
}
