import { posix } from "path";

import { AuthConfigPayload, DeploymentTargetPayload } from "@miragon/bpmn-modeler-shared";

import {
    DeploymentStatePort,
    NotifierPort,
    PickerPort,
    SecretStorePort,
    SettingsPort,
    WorkspacePort,
} from "../../shared/domain/hostPorts";
import { ArtifactService } from "../../shared/service/ArtifactService";
import { AuthConfig, BasicAuth, NoAuth, OAuth2Auth } from "../domain/deployment";
import {
    DeploymentTarget,
    DeploymentTargets,
    parseDeploymentTargetsFile,
    serializeDeploymentTargets,
} from "../domain/deploymentTarget";

const TARGETS_FILE_NAME = "deployment-targets.json";

/**
 * Where the targets file lives for the current context. `filePath` is the read
 * location (nearest existing file) and the write location (the same file, or a
 * fresh one under the workspace config folder when none exists yet).
 */
interface TargetsLocation {
    readonly filePath: string;
    readonly exists: boolean;
}

/**
 * Manages named deployment targets: the `deployment-targets.json` file (locate,
 * read, CRUD), the active target (persistence + status bar), and per-target
 * credential slots. Kept separate from {@link DeploymentService} (which owns the
 * REST call and the ad-hoc legacy path) so target lifecycle is its own concern.
 * The status bar is owned by `DeploymentStatusService`, not here.
 */
export class DeploymentTargetService {
    constructor(
        private readonly artifactService: ArtifactService,
        private readonly settings: SettingsPort,
        private readonly workspace: WorkspacePort,
        private readonly secretStore: SecretStorePort,
        private readonly deploymentState: DeploymentStatePort,
        private readonly picker: PickerPort,
        private readonly notifier: NotifierPort,
    ) {}

    /**
     * Resolves the targets file for `documentDir` (nearest existing one when a
     * BPMN file is focused, else the first workspace folder). `undefined` means
     * there is no workspace to store a file in.
     */
    async locateTargetsFile(documentDir?: string): Promise<TargetsLocation | undefined> {
        const configFolder = this.settings.getConfigFolder();

        if (documentDir !== undefined) {
            const workspaceRoot = await this.artifactService.getWorkspaceRoot(documentDir);
            const found = await this.artifactService.findConfigFile(
                documentDir,
                configFolder,
                TARGETS_FILE_NAME,
                workspaceRoot,
            );
            if (found !== undefined) {
                return { filePath: found, exists: true };
            }
            return {
                filePath: posix.join(workspaceRoot, configFolder, TARGETS_FILE_NAME),
                exists: false,
            };
        }

        const workspaceRoot = this.workspace.getWorkspaceFolderPaths()[0];
        if (workspaceRoot === undefined) {
            return undefined;
        }
        const found = await this.artifactService.findConfigFile(
            workspaceRoot,
            configFolder,
            TARGETS_FILE_NAME,
            workspaceRoot,
        );
        return {
            filePath: found ?? posix.join(workspaceRoot, configFolder, TARGETS_FILE_NAME),
            exists: found !== undefined,
        };
    }

    async listTargets(documentDir?: string): Promise<DeploymentTarget[]> {
        try {
            return await this.readTargets(await this.locateTargetsFile(documentDir));
        } catch (error) {
            this.notifier.notifyError(
                "Could not read deployment targets",
                error instanceof Error ? error : new Error(String(error)),
            );
            return [];
        }
    }

    private async readTargets(location: TargetsLocation | undefined): Promise<DeploymentTarget[]> {
        if (location === undefined || !location.exists) return [];
        return parseDeploymentTargetsFile(
            JSON.parse(await this.workspace.readFile(location.filePath)),
        );
    }

    async getTarget(name: string, documentDir?: string): Promise<DeploymentTarget | undefined> {
        return new DeploymentTargets(
            await this.readTargets(await this.locateTargetsFile(documentDir)),
        ).find(name);
    }

    /**
     * Creates a target from the entered form data, persists its credentials, and
     * makes it active. Throws {@link DuplicateDeploymentTargetError} when the
     * name already exists — nothing is written and no secret is stored in that
     * case, so a failed create leaves the file untouched.
     */
    async createTarget(
        payload: DeploymentTargetPayload,
        auth: AuthConfigPayload,
        documentDir?: string,
    ): Promise<void> {
        await this.persistTarget(payload, auth, documentDir, (targets, target) =>
            targets.add(target),
        );
    }

    /**
     * Upserts `target`, persists credentials to its slot, and makes it active. A
     * rename (`previousName` set and different) removes the old entry and its
     * credential slot so no orphaned secret survives; a rename onto an existing
     * name throws {@link DuplicateDeploymentTargetError} before anything is
     * written.
     */
    async saveTarget(
        payload: DeploymentTargetPayload,
        auth: AuthConfigPayload,
        previousName: string | undefined,
        documentDir?: string,
    ): Promise<void> {
        const { location, target } = await this.persistTarget(
            payload,
            auth,
            documentDir,
            (targets, next) => targets.upsert(next, previousName),
        );
        if (previousName !== undefined && previousName.trim() !== target.name) {
            await this.secretStore.delete(this.slotFor(location.filePath, previousName.trim()));
        }
    }

    private async persistTarget(
        payload: DeploymentTargetPayload,
        auth: AuthConfigPayload,
        documentDir: string | undefined,
        apply: (targets: DeploymentTargets, target: DeploymentTarget) => DeploymentTarget[],
    ): Promise<{ location: TargetsLocation; target: DeploymentTarget }> {
        const location = await this.locateTargetsFile(documentDir);
        if (location === undefined) {
            throw new Error("Open a workspace folder before saving a deployment target.");
        }

        const [target] = parseDeploymentTargetsFile({
            targets: [toDomainTarget(payload).toJson()],
        });
        const current = await this.readTargets(location);
        const next = apply(new DeploymentTargets(current), target);
        await this.workspace.writeFile(location.filePath, serializeDeploymentTargets(next));

        await this.saveSecrets(this.slotFor(location.filePath, target.name), auth);
        await this.setActiveTarget(target.name);
        return { location, target };
    }

    async deleteTarget(name: string, documentDir?: string): Promise<boolean> {
        const confirmed = await this.picker.confirmDestructive({
            title: `Delete deployment target "${name}"?`,
            confirmLabel: "Delete",
            details: [`Target "${name}" and its stored credentials will be removed.`],
        });
        if (!confirmed) {
            return false;
        }

        const location = await this.locateTargetsFile(documentDir);
        if (location === undefined || !location.exists) {
            return false;
        }
        const current = await this.readTargets(location);
        const next = new DeploymentTargets(current).remove(name);
        await this.workspace.writeFile(location.filePath, serializeDeploymentTargets(next));
        await this.secretStore.delete(this.slotFor(location.filePath, name));

        if (this.deploymentState.getActiveTargetName() === name.trim()) {
            await this.setActiveTarget("");
        }
        return true;
    }

    /**
     * Opens the targets file in the host editor for direct editing, creating an
     * empty one first so the user lands in a schema-validated document rather
     * than a "file not found" error.
     * @throws {Error} if there is no workspace to store the file in.
     */
    async openTargetsFile(documentDir?: string): Promise<void> {
        const location = await this.locateTargetsFile(documentDir);
        if (location === undefined) {
            throw new Error("Open a workspace folder to edit deployment targets.");
        }
        if (!location.exists) {
            await this.workspace.writeFile(location.filePath, serializeDeploymentTargets([]));
        }
        await this.notifier.openDocument(location.filePath);
    }

    /**
     * The active target, or `undefined` for ad-hoc mode. A persisted name that
     * no longer resolves to a target (file hand-edited) is tolerated as ad-hoc.
     */
    async getActiveTarget(documentDir?: string): Promise<DeploymentTarget | undefined> {
        const name = this.deploymentState.getActiveTargetName();
        if (name === "") {
            return undefined;
        }
        return new DeploymentTargets(await this.listTargets(documentDir)).find(name);
    }

    async setActiveTarget(name: string): Promise<void> {
        await this.deploymentState.saveActiveTargetName(name.trim());
    }

    /**
     * Picker → persist → status bar. A dismissal is a no-op; the explicit
     * "(none)" entry resolves to `""` (ad-hoc mode).
     */
    async switchActiveTarget(documentDir?: string): Promise<void> {
        const names = (await this.listTargets(documentDir)).map((target) => target.name);
        const picked = await this.picker.pickDeploymentTarget(names);
        if (picked === undefined) {
            return;
        }
        await this.setActiveTarget(picked);
    }

    /** Resolves an active target's stored credentials into an auth payload. */
    async getStoredCredentials(
        targetName: string,
        documentDir?: string,
    ): Promise<AuthConfigPayload> {
        const target = new DeploymentTargets(await this.listTargets(documentDir)).find(targetName);
        if (target === undefined) {
            return { authType: "none" };
        }
        const location = await this.locateTargetsFile(documentDir);
        const slot = location ? this.slotFor(location.filePath, target.name) : undefined;

        if (target.authType === "basic") {
            const creds = await this.secretStore.getBasicAuth(slot);
            if (creds) {
                return {
                    authType: "basic",
                    username: creds.username,
                    password: creds.password,
                };
            }
        } else if (target.authType === "oauth2") {
            const creds = await this.secretStore.getOAuth2(slot);
            if (creds) {
                return {
                    authType: "oauth2",
                    clientId: creds.clientId,
                    clientSecret: creds.clientSecret,
                    tokenEndpoint: target.tokenEndpoint,
                    audience: target.audience,
                };
            }
        }
        return {
            authType: target.authType,
            ...(target.authType === "oauth2"
                ? { tokenEndpoint: target.tokenEndpoint, audience: target.audience }
                : {}),
        };
    }

    /** Resolves an active target's stored credentials into a domain auth object. */
    async getCredentials(target: DeploymentTarget, documentDir?: string): Promise<AuthConfig> {
        const location = await this.locateTargetsFile(documentDir);
        const slot = location ? this.slotFor(location.filePath, target.name) : undefined;

        if (target.authType === "basic") {
            const creds = await this.secretStore.getBasicAuth(slot);
            return creds ? new BasicAuth(creds.username, creds.password) : new NoAuth();
        }
        if (target.authType === "oauth2") {
            const creds = await this.secretStore.getOAuth2(slot);
            return creds
                ? new OAuth2Auth(
                      creds.clientId,
                      creds.clientSecret,
                      target.tokenEndpoint,
                      target.audience,
                  )
                : new NoAuth();
        }
        return new NoAuth();
    }

    /**
     * The secret slot for `targetName`, or `undefined` for ad-hoc mode / no
     * workspace. Used by the deploy path to persist credentials under a target.
     */
    async resolveSlot(targetName: string, documentDir?: string): Promise<string | undefined> {
        if (targetName.trim() === "") {
            return undefined;
        }
        const location = await this.locateTargetsFile(documentDir);
        return location ? this.slotFor(location.filePath, targetName) : undefined;
    }

    private slotFor(filePath: string, name: string): string {
        return `${filePath}::${name.trim()}`;
    }

    private async saveSecrets(slot: string, auth: AuthConfigPayload): Promise<void> {
        if (auth.authType === "basic") {
            await this.secretStore.saveBasicAuth(auth.username ?? "", auth.password ?? "", slot);
        } else if (auth.authType === "oauth2") {
            await this.secretStore.saveOAuth2(auth.clientId ?? "", auth.clientSecret ?? "", slot);
        }
    }
}

function toDomainTarget(payload: DeploymentTargetPayload): DeploymentTarget {
    return new DeploymentTarget(
        payload.name.trim(),
        payload.engine,
        payload.endpoint,
        payload.tenantId,
        payload.authType,
        payload.tokenEndpoint ?? "",
        payload.audience ?? "",
        payload.deployUrl?.trim() ? payload.deployUrl.trim() : undefined,
        payload.startInstanceUrl?.trim() ? payload.startInstanceUrl.trim() : undefined,
    );
}

export function toTargetPayload(target: DeploymentTarget): DeploymentTargetPayload {
    return {
        name: target.name,
        engine: target.engine,
        endpoint: target.endpoint,
        tenantId: target.tenantId,
        authType: target.authType,
        tokenEndpoint: target.tokenEndpoint,
        audience: target.audience,
        deployUrl: target.deployUrl,
        startInstanceUrl: target.startInstanceUrl,
    };
}
