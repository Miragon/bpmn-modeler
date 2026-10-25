import { posix } from "path";

import { FileNotFound, UnreadableDotEnvError } from "../../shared/domain/errors";
import { WorkspacePort } from "../../shared/domain/hostPorts";
import { parseDotEnv } from "../domain/dotEnv";
import {
    emptyEnvLookup,
    EnvLookup,
    EnvReferencing,
    NO_ENV_VARIABLES,
    referenceableVariables,
} from "../domain/envRef";
import { DeploymentTargetService } from "./DeploymentTargetService";

const DOT_ENV_FILE_NAME = ".env";

/**
 * Where the `.env` comes from: a named target reads the one beside its targets
 * file's config folder; an ad-hoc request — whose endpoint the user typed —
 * reads the one at its workspace folder, so a nested targets file can't supply
 * variables for it.
 */
export type EnvScope = "targetsFile" | "workspaceFolder";

/**
 * Builds the variable lookup for `${env:…}` expansion from exactly one project
 * `.env`. The process environment is deliberately not a source: it is shared
 * by every project, and any other `.env` (a git root, a parent folder) may
 * belong to a different, less trusted tree than whatever names the endpoint.
 */
export class EnvValueResolver {
    constructor(
        private readonly targetsLocator: Pick<DeploymentTargetService, "locateTargetsFile">,
        private readonly workspace: WorkspacePort,
    ) {}

    /**
     * `.env` is read only when a subject references it, so a broken or
     * unrelated `.env` (e.g. a Python virtualenv directory) can't fail requests
     * that use no references.
     *
     * @throws {UnreadableDotEnvError} when `.env` exists but is not a readable
     *   regular file — a symlink is refused, as a repository could point it at
     *   another project's secrets.
     */
    async createLookup(
        scope: EnvScope,
        documentDir: string | undefined,
        ...subjects: EnvReferencing[]
    ): Promise<EnvLookup> {
        if (!subjects.some((subject) => subject.referencesEnv())) {
            return NO_ENV_VARIABLES;
        }
        const projectDir =
            scope === "targetsFile"
                ? await this.locateTargetsProjectDir(documentDir)
                : this.locateWorkspaceFolder(documentDir);
        if (projectDir === undefined) {
            return NO_ENV_VARIABLES;
        }
        return this.readDotEnv(posix.join(projectDir, DOT_ENV_FILE_NAME));
    }

    /**
     * A document outside every workspace folder gets no `.env`, and neither does
     * a targets file that a config folder like `../x` places outside its project.
     */
    private async locateTargetsProjectDir(
        documentDir: string | undefined,
    ): Promise<string | undefined> {
        if (this.locateWorkspaceFolder(documentDir) === undefined) {
            return undefined;
        }
        const location = await this.targetsLocator.locateTargetsFile(documentDir);
        if (location === undefined) {
            return undefined;
        }
        const relativeFilePath = posix.relative(location.projectDir, location.filePath);
        const escapesProject = relativeFilePath === ".." || relativeFilePath.startsWith("../");
        return escapesProject ? undefined : location.projectDir;
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
