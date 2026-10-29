import { FileNotFound } from "../../kernel/domain/errors";
import { UnreadableDotEnvError } from "../domain/errors";
import { WorkspacePort } from "../../kernel/domain/hostPorts";
import { joinWorkspacePath } from "../../kernel/domain/workspacePath";
import { DeploymentDestination } from "../domain/deploymentDestination";
import { parseDotEnv } from "../domain/dotEnv";
import {
    emptyEnvLookup,
    EnvLookup,
    EnvReferencing,
    NO_ENV_VARIABLES,
    referenceableVariables,
} from "../domain/envRef";

const DOT_ENV_FILE_NAME = ".env";

/**
 * Builds the variable lookup for `${env:…}` expansion from exactly one project
 * `.env`. The process environment is deliberately not a source: it is shared
 * by every project, and any other `.env` (a git root, a parent folder) may
 * belong to a different, less trusted tree than whatever names the endpoint.
 */
export class EnvValueResolver {
    constructor(private readonly workspace: WorkspacePort) {}

    /**
     * `.env` is read only when a subject references it, so a broken or
     * unrelated `.env` (e.g. a Python virtualenv directory) can't fail requests
     * that use no references. The destination chooses which `.env` it reads.
     *
     * @throws {UnreadableDotEnvError} when `.env` exists but is not a readable
     *   regular file — a symlink is refused, as a repository could point it at
     *   another project's secrets.
     */
    async createLookup(
        destination: DeploymentDestination,
        documentDir: string | undefined,
        ...subjects: EnvReferencing[]
    ): Promise<EnvLookup> {
        if (!subjects.some((subject) => subject.referencesEnv())) {
            return NO_ENV_VARIABLES;
        }
        const dotEnvDirectory = destination.dotEnvDirectory(
            this.locateWorkspaceFolder(documentDir),
        );
        if (dotEnvDirectory === undefined) {
            return NO_ENV_VARIABLES;
        }
        return this.readDotEnv(joinWorkspacePath(dotEnvDirectory, DOT_ENV_FILE_NAME));
    }

    private locateWorkspaceFolder(documentDir: string | undefined): string | undefined {
        return documentDir === undefined
            ? this.workspace.getWorkspaceFolderPaths()[0]
            : this.workspace.findWorkspaceFolderForDocument(documentDir);
    }

    private async readDotEnv(dotEnvPath: string): Promise<EnvLookup> {
        let content: string;
        try {
            if (await this.workspace.isSymbolicLink(dotEnvPath)) {
                throw new UnreadableDotEnvError(dotEnvPath, "symbolic links are not followed");
            }
            content = await this.workspace.readFile(dotEnvPath);
        } catch (error) {
            if (error instanceof FileNotFound) {
                return emptyEnvLookup(dotEnvPath);
            }
            throw error instanceof UnreadableDotEnvError
                ? error
                : new UnreadableDotEnvError(
                      dotEnvPath,
                      error instanceof Error ? error.message : String(error),
                  );
        }
        return referenceableVariables(parseDotEnv(content), dotEnvPath);
    }
}
