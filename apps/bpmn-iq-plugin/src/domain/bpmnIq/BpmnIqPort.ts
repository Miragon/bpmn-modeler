/**
 * Domain-level contract for the bpmn-iq daemon.
 *
 * Implementations encapsulate the HTTP/SSE transport so that the sync
 * service can be unit-tested against an in-memory fake and so that the
 * upstream `@miragon/bpmn-iq-daemon-client` package can be swapped out
 * without touching service code.
 */

export interface BpmnIqModelRef {
    relPath: string;
    xml: string;
    sha256: string;
}

export interface BpmnIqWorkspaceSnapshot {
    workspaceId: string;
    name: string;
    createdAt: string;
    lastSeenAt: string;
    repoId?: string;
    repoSlug?: string;
    branch?: string;
}

export interface BpmnIqRegisterOptions {
    name: string;
    repoId?: string;
    repoSlug?: string;
    branch?: string;
}

export interface BpmnIqWorkspaceModels {
    workspace: BpmnIqWorkspaceSnapshot;
    models: BpmnIqModelRef[];
}

export interface BpmnIqSseEvent {
    type: "model-added" | "model-changed" | "model-removed";
    /** Present for add/change events. */
    modelRef?: { id: string; relPath: string; sha256: string };
    /** Present for remove events. */
    modelId?: string;
}

export interface BpmnIqSessionActive {
    /** Fully-qualified model id, e.g. `workspace:<workspaceId>:<urlEncoded relPath>`. */
    modelId: string;
    /** Optional BPMN element id that is currently selected inside the modeler. */
    elementId?: string;
}

export interface BpmnIqPort {
    readonly baseUrl: string;
    readonly workspaceId: string;

    /** Register this workspace with the daemon. Idempotent on the daemon side. */
    registerWorkspace(opts: BpmnIqRegisterOptions): Promise<void>;

    /** Unregister the workspace (best-effort; daemon may already have swept it). */
    unregisterWorkspace(): Promise<void>;

    /** Refresh `lastSeenAt`; returns false if the workspace has been swept. */
    heartbeat(): Promise<boolean>;

    /** Upsert a workspace-scoped model. Returns the SHA the daemon ended up storing. */
    upsertModel(relPath: string, xml: string): Promise<string>;

    /** Remove a single workspace-scoped model. */
    removeModel(relPath: string): Promise<void>;

    /** Fetch raw BPMN XML for a previously-listed model id. */
    getModel(modelId: string): Promise<{ xml: string; sha256: string }>;

    /** List every model registered for this workspace plus metadata. */
    listWorkspaceModels(): Promise<BpmnIqWorkspaceModels>;

    /**
     * Open a long-lived SSE connection and invoke `onEvent` for each
     * incoming model event. Resolves when the signal aborts or the
     * server closes the connection.
     */
    streamEvents(
        onEvent: (event: BpmnIqSseEvent) => void,
        signal: AbortSignal,
    ): Promise<void>;

    /**
     * Push the currently-active model/element to the daemon so that
     * `modelId: "active"` in downstream MCP tools resolves correctly.
     * Best-effort: errors should be logged but not thrown.
     */
    setSessionActive(active: BpmnIqSessionActive | null): Promise<void>;
}
