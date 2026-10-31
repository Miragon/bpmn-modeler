import { AuthConfigPayload, DeploymentTargetPayload } from "@miragon/bpmn-modeler-shared";

import { configFolderPath } from "../../kernel/domain/configArtifacts";
import {
    NotifierPort,
    PickerPort,
    SettingsPort,
    WorkspacePort,
} from "../../kernel/domain/hostPorts";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import { CredentialDestinations } from "../domain/credentialDestinations";
import { AuthConfig, BasicAuth, NoAuth, OAuth2Auth } from "../domain/deployment";
import {
    DeploymentTarget,
    DeploymentTargets,
    parseDeploymentTargetsFile,
    serializeDeploymentTargets,
    TargetAuth,
    TargetChange,
} from "../domain/deploymentTarget";
import { CredentialRefs } from "../domain/credentialRefs";
import {
    activeDestination,
    AdHocDestination,
    DeploymentDestination,
    DestinationResolution,
    NamedDestination,
    namesTarget,
    prefillDestination,
    resolveNamedDestination,
    TargetEdit,
    TargetsLocation,
    targetSecretSlot,
} from "../domain/deploymentDestination";
import {
    DeploymentTargetsEvent,
    DeploymentTargetsListener,
} from "../domain/deploymentTargetsEvent";
import { DeploymentPickerPort, DeploymentStatePort, SecretStorePort } from "../domain/ports";
import { EditorSubscription } from "../../editorSession/domain/EditorSession";
import { storeCredentials } from "./storeCredentials";

const TARGETS_FILE_NAME = "deployment-targets.json";

/**
 * Manages named deployment targets: the `deployment-targets.json` file (locate,
 * read, CRUD), the active target's persistence, and per-target credential
 * slots. Kept separate from {@link DeploymentService} (which owns the
 * REST call and the ad-hoc legacy path) so target lifecycle is its own concern.
 * The status bar is owned by `DeploymentStatusService`, not here; it and the
 * open panel follow the changes published through {@link onDidChange}.
 */
export class DeploymentTargetService {
    private readonly changeListeners = new Set<DeploymentTargetsListener>();

    constructor(
        private readonly artifactService: ArtifactService,
        private readonly settings: SettingsPort,
        private readonly workspace: WorkspacePort,
        private readonly secretStore: SecretStorePort,
        private readonly deploymentState: DeploymentStatePort,
        private readonly picker: PickerPort & DeploymentPickerPort,
        private readonly notifier: NotifierPort,
    ) {}

    /** Once per successful target edit or switch, never for a rejected or cancelled one. */
    onDidChange(listener: DeploymentTargetsListener): EditorSubscription {
        this.changeListeners.add(listener);
        return { dispose: () => this.changeListeners.delete(listener) };
    }

    /** The change is made by then, so a failing listener must not report it as failed. */
    private async publish(event: DeploymentTargetsEvent): Promise<void> {
        for (const listener of [...this.changeListeners]) {
            try {
                await listener(event);
            } catch (error) {
                this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            }
        }
    }

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
            filePath: configFolderPath(projectDir, configFolder, TARGETS_FILE_NAME),
            exists: foundIn !== undefined,
            projectDir,
        };
    }

    async listTargets(documentDir?: string): Promise<DeploymentTarget[]> {
        return (await this.readTargetsFileOrNone(documentDir)).targets;
    }

    /** An unreadable file is reported and holds no targets, so the sidebar still renders. */
    private async readTargetsFileOrNone(
        documentDir: string | undefined,
    ): Promise<{ location: TargetsLocation | undefined; targets: DeploymentTarget[] }> {
        try {
            const location = await this.locateTargetsFile(documentDir);
            return { location, targets: await this.readTargets(location) };
        } catch (error) {
            this.notifier.notifyError(
                "Could not read deployment targets",
                error instanceof Error ? error : new Error(String(error)),
            );
            return { location: undefined, targets: [] };
        }
    }

    private async readTargets(location: TargetsLocation | undefined): Promise<DeploymentTarget[]> {
        if (location === undefined || !location.exists) return [];
        return parseDeploymentTargetsFile(
            JSON.parse(await this.workspace.readFile(location.filePath)),
        );
    }

    /**
     * What a request's `targetName` selects. Unlike the sidebar, a request fails
     * on a targets file it cannot read rather than running unchecked.
     */
    async resolveDestination(
        targetName: string | undefined,
        adHoc: AdHocDestination,
        documentDir?: string,
    ): Promise<DestinationResolution> {
        if (!namesTarget(targetName)) {
            return adHoc;
        }
        const location = await this.locateTargetsFile(documentDir);
        return resolveNamedDestination(
            targetName,
            location,
            new DeploymentTargets(await this.readTargets(location)),
        );
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
    ): Promise<TargetEdit> {
        return this.persistTarget(payload, auth, documentDir, (targets, target) =>
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
    ): Promise<TargetEdit> {
        return this.persistTarget(payload, auth, documentDir, (targets, target) =>
            targets.upsert(target, previousName),
        );
    }

    private async persistTarget(
        payload: DeploymentTargetPayload,
        auth: AuthConfigPayload,
        documentDir: string | undefined,
        apply: (targets: DeploymentTargets, target: DeploymentTarget) => TargetChange,
    ): Promise<TargetEdit> {
        const location = await this.locateTargetsFile(documentDir);
        if (location === undefined) {
            throw new Error("Open a workspace folder before saving a deployment target.");
        }

        const credentials = toAuthConfig(auth);
        credentials.assertCredentialEnvRefsValid();
        const target = DeploymentTarget.create({
            ...payload,
            credentialRefs: CredentialRefs.of(credentials),
        });
        const current = new DeploymentTargets(await this.readTargets(location));
        const change = apply(current, target);
        await this.workspace.writeFile(
            location.filePath,
            serializeDeploymentTargets(change.targets),
        );

        // Refs are stored too: they overwrite any older literal, and a backend that
        // reads an empty half back as null would drop the literal next to it.
        const slot = targetSecretSlot(location, target.name);
        await storeCredentials(this.secretStore, credentials, slot);
        await this.approveTypedDestinations(
            slot,
            target,
            change.approvalsInheritedFrom,
            current,
            location,
        );
        await this.saveActiveTargetName(target.name);
        if (change.retiredSlotName !== undefined) {
            await this.secretStore.delete(targetSecretSlot(location, change.retiredSlotName));
        }
        return this.publishEdit(new TargetEdit(change, location), documentDir);
    }

    private async publishEdit(
        edit: TargetEdit,
        documentDir: string | undefined,
    ): Promise<TargetEdit> {
        await this.publish({ kind: "targetsChanged", edit, documentDir });
        return edit;
    }

    /**
     * Saving approves only the hosts the user typed. A host any target in the
     * shared file already names may have reached the form from there — the
     * sidebar's New starts from the selected target — so it still asks at first
     * use.
     */
    private async approveTypedDestinations(
        slot: string,
        target: DeploymentTarget,
        approvalsInheritedFrom: string | undefined,
        current: DeploymentTargets,
        location: TargetsLocation,
    ): Promise<void> {
        const inherited =
            approvalsInheritedFrom === undefined
                ? CredentialDestinations.none()
                : CredentialDestinations.fromOrigins(
                      await this.secretStore.getApprovedDestinations(
                          targetSecretSlot(location, approvalsInheritedFrom),
                      ),
                  );
        const typed = target.knownCredentialDestinations().without(current.knownDestinations());
        await this.secretStore.saveApprovedDestinations(slot, [...inherited.union(typed).origins]);
    }

    /** @returns `undefined` when the user cancels or there is no targets file. */
    async deleteTarget(name: string, documentDir?: string): Promise<TargetEdit | undefined> {
        const confirmed = await this.picker.confirmDestructive({
            title: `Delete deployment target "${name}"?`,
            confirmLabel: "Delete",
            details: [`Target "${name}" and its stored credentials will be removed.`],
        });
        if (!confirmed) {
            return undefined;
        }

        const location = await this.locateTargetsFile(documentDir);
        if (location === undefined || !location.exists) {
            return undefined;
        }
        const current = await this.readTargets(location);
        const change = new DeploymentTargets(current).remove(name);
        await this.workspace.writeFile(
            location.filePath,
            serializeDeploymentTargets(change.targets),
        );
        await this.secretStore.delete(targetSecretSlot(location, change.retiredSlotName));

        if (this.deploymentState.getActiveTargetName() === change.name) {
            await this.saveActiveTargetName("");
        }
        return this.publishEdit(new TargetEdit(change, location), documentDir);
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
     * The active target, or the remembered ad-hoc connection. A persisted name
     * that no longer resolves to a target (file hand-edited) is tolerated as ad-hoc.
     */
    async getActiveDestination(documentDir?: string): Promise<DeploymentDestination> {
        const rememberedAdHoc = new AdHocDestination(
            this.deploymentState.getEndpoint(),
            this.deploymentState.getTenantId(),
        );
        const name = this.deploymentState.getActiveTargetName();
        if (!namesTarget(name)) {
            return rememberedAdHoc;
        }
        const { location, targets } = await this.readTargetsFileOrNone(documentDir);
        return activeDestination(
            resolveNamedDestination(name, location, new DeploymentTargets(targets)),
            rememberedAdHoc,
        );
    }

    /** The active target, or `undefined` for ad-hoc mode. */
    async getActiveTarget(documentDir?: string): Promise<DeploymentTarget | undefined> {
        return (await this.getActiveDestination(documentDir)).target;
    }

    async setActiveTarget(name: string): Promise<void> {
        const activeName = await this.saveActiveTargetName(name);
        await this.publish({ kind: "activeTargetChanged", activeName });
    }

    /** A target edit publishes its own change, so it stores the active name without another one. */
    private async saveActiveTargetName(name: string): Promise<string> {
        const activeName = name.trim();
        await this.deploymentState.saveActiveTargetName(activeName);
        return activeName;
    }

    /**
     * Picker → persist → listeners. A dismissal is a no-op; the explicit
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
        const { location, targets } = await this.readTargetsFileOrNone(documentDir);
        const destination = prefillDestination(
            resolveNamedDestination(targetName, location, new DeploymentTargets(targets)),
        );
        if (destination === undefined) {
            return { authType: "none" };
        }
        const { target } = destination;
        const auth = await this.getCredentials(destination);
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
        return authSettingsPayload(target.auth);
    }

    /** Resolves a named target's credentials into a domain auth object. */
    async getCredentials({ target, secretSlot }: NamedDestination): Promise<AuthConfig> {
        if (target.auth.type === "basic") {
            return target.authWith(await this.secretStore.getBasicAuth(secretSlot));
        }
        if (target.auth.type === "oauth2") {
            return target.authWith(await this.secretStore.getOAuth2(secretSlot));
        }
        return new NoAuth();
    }
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
        ...authSettingsPayload(target.auth),
        deployUrl: target.deployUrl,
        startInstanceUrl: target.startInstanceUrl,
    };
}

/** What the form shows of a target's auth before any credential is filled in. */
function authSettingsPayload(
    auth: TargetAuth,
): Pick<AuthConfigPayload, "authType" | "tokenEndpoint" | "audience"> {
    return auth.type === "oauth2"
        ? { authType: auth.type, tokenEndpoint: auth.tokenEndpoint, audience: auth.audience }
        : { authType: auth.type };
}
