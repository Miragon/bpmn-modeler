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
import { CredentialDestinations } from "../domain/credentialDestinations";
import { AuthConfig, BasicAuth, NoAuth, OAuth2Auth } from "../domain/deployment";
import {
    DeploymentTarget,
    DeploymentTargets,
    parseDeploymentTargetsFile,
    serializeDeploymentTargets,
} from "../domain/deploymentTarget";
import { CredentialRefs } from "../domain/credentialRefs";

const TARGETS_FILE_NAME = "deployment-targets.json";

/**
 * Where the targets file lives for the current context. `filePath` is the read
 * location (nearest existing file) and the write location (the same file, or a
 * fresh one under the workspace config folder when none exists yet).
 */
export interface TargetsLocation {
    readonly filePath: string;
    readonly exists: boolean;
    /** The directory holding the config folder; its `.env` is the only one the targets may read. */
    readonly projectDir: string;
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
            return this.locateFrom(documentDir, workspaceRoot, configFolder);
        }

        const workspaceRoot = this.workspace.getWorkspaceFolderPaths()[0];
        if (workspaceRoot === undefined) {
            return undefined;
        }
        return this.locateFrom(workspaceRoot, workspaceRoot, configFolder);
    }

    private async locateFrom(
        startDir: string,
        workspaceRoot: string,
        configFolder: string,
    ): Promise<TargetsLocation> {
        const foundIn = await this.artifactService.findConfigBaseDir(
            startDir,
            configFolder,
            TARGETS_FILE_NAME,
            workspaceRoot,
        );
        const projectDir = foundIn ?? workspaceRoot;
        return {
            filePath: posix.join(projectDir, configFolder, TARGETS_FILE_NAME),
            exists: foundIn !== undefined,
            projectDir,
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
        await this.persistTarget(payload, auth, documentDir, undefined, (targets, target) =>
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
            previousName ?? payload.name,
            (targets, next) => targets.upsert(next, previousName),
        );
        if (previousName !== undefined && previousName.trim() !== target.name) {
            await this.secretStore.delete(this.slotFor(location.filePath, previousName.trim()));
        }
    }

    /** @param savedName The name the target had before this save; `undefined` for a create. */
    private async persistTarget(
        payload: DeploymentTargetPayload,
        auth: AuthConfigPayload,
        documentDir: string | undefined,
        savedName: string | undefined,
        apply: (targets: DeploymentTargets, target: DeploymentTarget) => DeploymentTarget[],
    ): Promise<{ location: TargetsLocation; target: DeploymentTarget }> {
        const location = await this.locateTargetsFile(documentDir);
        if (location === undefined) {
            throw new Error("Open a workspace folder before saving a deployment target.");
        }

        const credentials = toAuthConfig(auth);
        credentials.assertCredentialEnvRefsValid();
        const draft = toDomainTarget(payload, CredentialRefs.of(credentials));
        draft.assertEnvRefsValid();
        // Round-tripping through the parser applies every remaining file rule.
        const [target] = parseDeploymentTargetsFile({ targets: [draft.toJson()] });
        const current = new DeploymentTargets(await this.readTargets(location));
        const saved = savedName === undefined ? undefined : current.find(savedName);
        const next = apply(current, target);
        await this.workspace.writeFile(location.filePath, serializeDeploymentTargets(next));

        // Refs are stored too: they overwrite any older literal, and a backend that
        // reads an empty half back as null would drop the literal next to it.
        const slot = this.slotFor(location.filePath, target.name);
        await this.saveSecrets(slot, credentials);
        await this.approveTypedDestinations(slot, target, saved, current, location.filePath);
        await this.setActiveTarget(target.name);
        return { location, target };
    }

    /**
     * Saving approves only the hosts the user typed. A host any target in the
     * shared file already names may have reached the form from there — the
     * sidebar's New starts from the selected target — so it still asks at first
     * use. A create starts from no approvals, so a stale slot can't lend its own.
     */
    private async approveTypedDestinations(
        slot: string,
        target: DeploymentTarget,
        saved: DeploymentTarget | undefined,
        current: DeploymentTargets,
        filePath: string,
    ): Promise<void> {
        const inherited =
            saved === undefined
                ? CredentialDestinations.none()
                : CredentialDestinations.fromOrigins(
                      await this.secretStore.getApprovedDestinations(
                          this.slotFor(filePath, saved.name),
                      ),
                  );
        const typed = target.knownCredentialDestinations().without(current.knownDestinations());
        await this.secretStore.saveApprovedDestinations(slot, [...inherited.union(typed).origins]);
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

    /** The form prefill for a target: its file refs merged over its stored secrets. */
    async getStoredCredentials(
        targetName: string,
        documentDir?: string,
    ): Promise<AuthConfigPayload> {
        const target = new DeploymentTargets(await this.listTargets(documentDir)).find(targetName);
        if (target === undefined) {
            return { authType: "none" };
        }
        const auth = await this.getCredentials(target, documentDir);
        if (auth.type === "basic") {
            return { authType: "basic", username: auth.username, password: auth.password };
        }
        if (auth.type === "oauth2") {
            return {
                authType: "oauth2",
                clientId: auth.clientId,
                clientSecret: auth.clientSecret,
                tokenEndpoint: auth.tokenEndpoint,
                audience: auth.audience,
            };
        }
        return {
            authType: target.authType,
            ...(target.authType === "oauth2"
                ? { tokenEndpoint: target.tokenEndpoint, audience: target.audience }
                : {}),
        };
    }

    /** Resolves an active target's credentials into a domain auth object. */
    async getCredentials(target: DeploymentTarget, documentDir?: string): Promise<AuthConfig> {
        const location = await this.locateTargetsFile(documentDir);
        const slot = location ? this.slotFor(location.filePath, target.name) : undefined;
        if (target.authType === "basic") {
            return target.authWith(await this.secretStore.getBasicAuth(slot));
        }
        if (target.authType === "oauth2") {
            return target.authWith(await this.secretStore.getOAuth2(slot));
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

    private async saveSecrets(slot: string, auth: AuthConfig): Promise<void> {
        if (auth.type === "basic") {
            await this.secretStore.saveBasicAuth(auth.username, auth.password, slot);
        } else if (auth.type === "oauth2") {
            await this.secretStore.saveOAuth2(auth.clientId, auth.clientSecret, slot);
        }
    }
}

function toDomainTarget(
    payload: DeploymentTargetPayload,
    credentialRefs: CredentialRefs,
): DeploymentTarget {
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
        credentialRefs,
    );
}

export function toAuthConfig(payload: AuthConfigPayload): AuthConfig {
    if (payload.authType === "basic") {
        return new BasicAuth(payload.username ?? "", payload.password ?? "");
    }
    if (payload.authType === "oauth2") {
        return new OAuth2Auth(
            payload.clientId ?? "",
            payload.clientSecret ?? "",
            payload.tokenEndpoint ?? "",
            payload.audience ?? "",
        );
    }
    return new NoAuth();
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
