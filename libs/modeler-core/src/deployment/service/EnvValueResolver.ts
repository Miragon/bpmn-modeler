import { posix } from "path";

import { FileNotFound } from "../../shared/domain/errors";
import { EnvPort, WorkspacePort } from "../../shared/domain/hostPorts";
import { ArtifactService } from "../../shared/service/ArtifactService";
import { AuthConfig, BasicAuth, OAuth2Auth } from "../domain/deployment";
import { parseDotEnv } from "../domain/dotEnv";
import { EnvLookup, expandEnvRefs } from "../domain/envRef";

const DOT_ENV_FILE_NAME = ".env";

/**
 * Resolves `${env:VAR}` references in deployment fields at request-build time,
 * looking up variables first in the workspace-root `.env` file, then in the host
 * process environment. Resolution happens here — the last moment before an HTTP
 * request — never upstream, so the secret store, the targets file, and the
 * webview only ever see the literal ref (see docs/adr/deployment.md).
 *
 * @throws {UnresolvedEnvVariableError} from the `resolve*` calls when a
 *   referenced variable has no value.
 */
export class EnvValueResolver {
    constructor(
        private readonly artifactService: ArtifactService,
        private readonly workspace: WorkspacePort,
        private readonly env: EnvPort,
    ) {}

    /**
     * Builds a variable lookup for one operation: the `.env` map wins over the
     * process environment. Callers that resolve several fields (or a `deployFiles`
     * batch) build one lookup and pass it to the `*With` resolvers so `.env` is
     * read once.
     */
    async createLookup(documentDir?: string): Promise<EnvLookup> {
        const dotEnv = await this.readDotEnv(documentDir);
        return (name: string) => dotEnv[name] ?? this.env.get(name);
    }

    async resolveAuth(auth: AuthConfig, documentDir?: string): Promise<AuthConfig> {
        if (!authHasRefs(auth)) {
            return auth;
        }
        return this.resolveAuthWith(auth, await this.createLookup(documentDir));
    }

    resolveAuthWith(auth: AuthConfig, lookup: EnvLookup): AuthConfig {
        if (auth.type === "basic") {
            return new BasicAuth(
                expandEnvRefs(auth.username, lookup, "username"),
                expandEnvRefs(auth.password, lookup, "password"),
            );
        }
        if (auth.type === "oauth2") {
            return new OAuth2Auth(
                expandEnvRefs(auth.clientId, lookup, "clientId"),
                expandEnvRefs(auth.clientSecret, lookup, "clientSecret"),
                expandEnvRefs(auth.tokenEndpoint, lookup, "tokenEndpoint"),
                expandEnvRefs(auth.audience, lookup, "audience"),
            );
        }
        return auth;
    }

    async resolveValue(
        value: string | undefined,
        field: string,
        documentDir?: string,
    ): Promise<string | undefined> {
        if (!hasRef(value)) {
            return value;
        }
        return expandEnvRefs(value!, await this.createLookup(documentDir), field);
    }

    resolveValueWith(
        value: string | undefined,
        field: string,
        lookup: EnvLookup,
    ): string | undefined {
        if (!hasRef(value)) {
            return value;
        }
        return expandEnvRefs(value!, lookup, field);
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

function authHasRefs(auth: AuthConfig): boolean {
    if (auth.type === "basic") {
        return hasRef(auth.username) || hasRef(auth.password);
    }
    if (auth.type === "oauth2") {
        return (
            hasRef(auth.clientId) ||
            hasRef(auth.clientSecret) ||
            hasRef(auth.tokenEndpoint) ||
            hasRef(auth.audience)
        );
    }
    return false;
}

function hasRef(value: string | undefined): boolean {
    return value !== undefined && value.includes("${env:");
}
