import { posix } from "path";

import { FileNotFound } from "../../shared/domain/errors";
import { EnvPort, WorkspacePort } from "../../shared/domain/hostPorts";
import { ArtifactService } from "../../shared/service/ArtifactService";
import { parseDotEnv } from "../domain/dotEnv";
import { EnvLookup } from "../domain/envRef";

const DOT_ENV_FILE_NAME = ".env";

/**
 * Builds the variable lookup for `${env:VAR}` expansion: the workspace-root
 * `.env` wins over the host process environment. Callers expand only when the
 * outbound request is built, so the secret store, targets file, and webview
 * keep the literal ref (see docs/adr/deployment.md).
 */
export class EnvValueResolver {
    constructor(
        private readonly artifactService: ArtifactService,
        private readonly workspace: WorkspacePort,
        private readonly env: EnvPort,
    ) {}

    async createLookup(documentDir?: string): Promise<EnvLookup> {
        const dotEnv = await this.readDotEnv(documentDir);
        return (name: string) => dotEnv[name] ?? this.env.get(name);
    }

    private async readDotEnv(documentDir?: string): Promise<Record<string, string>> {
        const root = await this.resolveWorkspaceRoot(documentDir);
        if (root === undefined) {
            return {};
        }
        try {
            return parseDotEnv(await this.workspace.readFile(posix.join(root, DOT_ENV_FILE_NAME)));
        } catch (error) {
            if (error instanceof FileNotFound) {
                return {};
            }
            throw error;
        }
    }

    private async resolveWorkspaceRoot(documentDir?: string): Promise<string | undefined> {
        if (documentDir !== undefined) {
            return this.artifactService.getWorkspaceRoot(documentDir);
        }
        return this.workspace.getWorkspaceFolderPaths()[0];
    }
}
