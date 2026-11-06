import type { AuthConfigPayload, AuthTypePayload } from "@miragon/bpmn-modeler-shared";

export type DraftActivity = "idle" | "switchingTarget" | "reloadingTarget" | "savingTarget";

export interface DraftSnapshot {
    readonly activity: DraftActivity;
    /** "" while the form holds ad-hoc values. */
    readonly editingTargetName: string;
    readonly dirty: boolean;
    readonly credentialsPending: boolean;
    /** Connection or credential-reference edits the selected target has not saved yet. */
    readonly targetDefinitionChanged: boolean;
}

export interface DraftControls {
    readonly saveDisabled: boolean;
    readonly saveTitle: string;
    readonly selectDisabled: boolean;
    readonly newDisabled: boolean;
    readonly deleteDisabled: boolean;
    readonly inputsDisabled: boolean;
}

const ACTIVITY_BLOCKED_REASON: Record<DraftActivity, string | undefined> = {
    idle: undefined,
    savingTarget: "Saving deployment target…",
    switchingTarget: "Loading deployment target…",
    reloadingTarget: "Loading deployment target…",
};

function waitBlockedReason(draft: DraftSnapshot): string | undefined {
    return (
        ACTIVITY_BLOCKED_REASON[draft.activity] ??
        (draft.credentialsPending ? "Loading credentials…" : undefined)
    );
}

export function executionBlockedReason(draft: DraftSnapshot): string | undefined {
    const waitReason = waitBlockedReason(draft);
    if (waitReason !== undefined) return waitReason;
    if (draft.editingTargetName !== "" && draft.targetDefinitionChanged) {
        return "Save target changes before deploying or starting an instance.";
    }
    return undefined;
}

export function saveBlockedReason(draft: DraftSnapshot): string | undefined {
    if (draft.editingTargetName === "") {
        return "Select a target to save changes, or use New to create one.";
    }
    if (!draft.dirty) return "No unsaved changes.";
    return waitBlockedReason(draft);
}

export function draftControls(draft: DraftSnapshot): DraftControls {
    const saveReason = saveBlockedReason(draft);
    const busy = draft.activity !== "idle";
    return {
        saveDisabled: saveReason !== undefined,
        saveTitle: saveReason ?? "Save target",
        selectDisabled: busy,
        newDisabled: busy || draft.credentialsPending,
        deleteDisabled: busy || draft.editingTargetName === "",
        // A save or load in flight is about to replace these values.
        inputsDisabled: busy,
    };
}

/**
 * Env references in credentials are saved to the shared targets file, so
 * changing one needs Save like a connection change. Literal edits stay free;
 * anything containing `${env:` counts, leaving the exact rule to the host.
 */
export function credentialRefSignatureOf(values: (string | undefined)[]): string {
    return JSON.stringify(
        values.map((value = "") => (value.includes("${env:") ? value.trim() : "")),
    );
}

/** The authentication inputs as typed; the auth type decides which of them count. */
export interface AuthFields {
    readonly authType: AuthTypePayload;
    readonly username: string;
    readonly password: string;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly tokenEndpoint: string;
    readonly audience: string;
}

type AuthFieldName = Exclude<keyof AuthConfigPayload, "authType">;

const AUTH_PAYLOAD_OF: Record<AuthTypePayload, (fields: AuthFields) => AuthConfigPayload> = {
    none: () => ({ authType: "none" }),
    basic: ({ username, password }) => ({
        authType: "basic",
        username: username.trim(),
        password,
    }),
    oauth2: ({ clientId, clientSecret, tokenEndpoint, audience }) => ({
        authType: "oauth2",
        clientId: clientId.trim(),
        clientSecret,
        tokenEndpoint: tokenEndpoint.trim(),
        audience: audience.trim(),
    }),
};

const REQUIRED_AUTH_FIELDS: Record<
    AuthTypePayload,
    readonly { readonly field: AuthFieldName; readonly reason: string }[]
> = {
    none: [],
    basic: [
        { field: "username", reason: "Username is required for Basic Auth." },
        { field: "password", reason: "Password is required for Basic Auth." },
    ],
    oauth2: [
        { field: "clientId", reason: "Client ID is required for OAuth2." },
        { field: "clientSecret", reason: "Client Secret is required for OAuth2." },
        { field: "tokenEndpoint", reason: "Token Endpoint is required for OAuth2." },
    ],
};

/** Names, ids and URLs are trimmed; secrets are sent as typed, spaces included. */
export function authPayloadOf(fields: AuthFields): AuthConfigPayload {
    return AUTH_PAYLOAD_OF[fields.authType](fields);
}

function missingEndpointReason(endpoint: string): string | undefined {
    return endpoint.trim() ? undefined : "REST endpoint is required.";
}

/** Judged on the sent payload: a username of spaces is missing, a password of spaces is not. */
function missingAuthFieldReason(auth: AuthConfigPayload): string | undefined {
    return REQUIRED_AUTH_FIELDS[auth.authType].find(({ field }) => !auth[field])?.reason;
}

/** Deploy and Start Instance both need the endpoint, then the fields the auth type requires. */
export function requestAuthOf(
    endpoint: string,
    fields: AuthFields,
): { readonly auth: AuthConfigPayload } | { readonly reason: string } {
    const auth = authPayloadOf(fields);
    const reason = missingEndpointReason(endpoint) ?? missingAuthFieldReason(auth);
    return reason === undefined ? { auth } : { reason };
}
