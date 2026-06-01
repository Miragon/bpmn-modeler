/**
 * Domain-level contract for the bpmn-iq daemon.
 *
 * Implementations encapsulate the HTTP/SSE transport so that the sync
 * service can be unit-tested against an in-memory fake and so that the
 * upstream `@miragon/bpmn-iq-daemon-client` package can be swapped out
 * without touching service code.
 */

import type {
    SessionActive,
    WorkspaceMeta,
    WorkspaceModelEntry,
} from "@miragon/bpmn-iq-daemon-client";

/**
 * Normalized SSE event our sync service consumes.  Maps from the
 * daemon's `DaemonServerEvent` via {@link decodeSseEvent}; drops the
 * `workspace-*` variants we don't react to, scopes to our workspace,
 * and exposes a flat shape the service can route on.
 */
export interface BpmnIqSseEvent {
    type: "model-added" | "model-changed" | "model-removed";
    /** Present for add/change events. */
    modelRef?: { id: string; relPath: string; sha256: string };
    /** Present for remove events. */
    modelId?: string;
}

export interface BpmnIqPort {
    readonly baseUrl: string;
    readonly workspaceId: string;

    /** Register this workspace with the daemon. Idempotent on the daemon side. */
    registerWorkspace(opts: {
        name: string;
        repoId?: string;
        repoSlug?: string;
        branch?: string;
    }): Promise<void>;

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
    listWorkspaceModels(): Promise<{
        workspace: WorkspaceMeta;
        models: WorkspaceModelEntry[];
    }>;

    /**
     * Open a long-lived SSE connection and invoke `onEvent` for each
     * incoming model event. Resolves when the signal aborts or the
     * server closes the connection.
     */
    streamEvents(onEvent: (event: BpmnIqSseEvent) => void, signal: AbortSignal): Promise<void>;

    /**
     * Push the currently-active model/element to the daemon so that
     * `modelId: "active"` in downstream MCP tools resolves correctly.
     * Best-effort: errors should be logged but not thrown.
     *
     * The daemon has no clear endpoint — to "unfocus", consumers just
     * stop calling this; the daemon handles staleness on its own.
     */
    setSessionActive(active: SessionActive): Promise<void>;
}
