import { DaemonClient } from "@miragon/bpmn-iq-daemon-client";

import type {
    BpmnIqPort,
    BpmnIqRegisterOptions,
    BpmnIqSessionActive,
    BpmnIqSseEvent,
    BpmnIqWorkspaceModels,
} from "../../domain/bpmnIq/BpmnIqPort";
import { decodeSseEvent } from "../../domain/bpmnIq/sseDecode";

/**
 * `BpmnIqPort` implementation that delegates REST calls to the upstream
 * `@miragon/bpmn-iq-daemon-client` package and handles the SSE decoding
 * plus the `POST /api/session/active` extension the client does not yet
 * expose.
 */
export class BpmnIqHttpAdapter implements BpmnIqPort {
    readonly baseUrl: string;

    readonly workspaceId: string;

    private readonly client: DaemonClient;

    constructor(baseUrl: string, workspaceId: string) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.workspaceId = workspaceId;
        this.client = new DaemonClient(this.baseUrl, workspaceId);
    }

    registerWorkspace(opts: BpmnIqRegisterOptions): Promise<void> {
        return this.client.registerWorkspace(opts);
    }

    unregisterWorkspace(): Promise<void> {
        return this.client.unregisterWorkspace();
    }

    heartbeat(): Promise<boolean> {
        return this.client.heartbeat();
    }

    async upsertModel(relPath: string, xml: string): Promise<string> {
        const model = await this.client.upsertModel(relPath, xml);
        return model.sha256;
    }

    removeModel(relPath: string): Promise<void> {
        return this.client.removeModel(relPath);
    }

    async getModel(modelId: string): Promise<{ xml: string; sha256: string }> {
        const res = await this.client.getModel(modelId);
        return { xml: res.xml, sha256: res.meta.sha256 };
    }

    async listWorkspaceModels(): Promise<BpmnIqWorkspaceModels> {
        const res = await this.client.listWorkspaceModels(this.workspaceId);
        return {
            workspace: {
                workspaceId: res.workspace.workspaceId,
                name: res.workspace.name,
                createdAt: res.workspace.createdAt,
                lastSeenAt: res.workspace.lastSeenAt,
                repoId: res.workspace.repoId,
                repoSlug: res.workspace.repoSlug,
                branch: res.workspace.branch,
            },
            models: res.models.map((m) => ({
                relPath: m.relPath,
                xml: m.xml,
                sha256: m.sha256,
            })),
        };
    }

    async streamEvents(
        onEvent: (event: BpmnIqSseEvent) => void,
        signal: AbortSignal,
    ): Promise<void> {
        await this.client.streamEvents((raw) => {
            const decoded = decodeSseEvent(raw, this.workspaceId);
            if (decoded) onEvent(decoded);
        }, signal);
    }

    async setSessionActive(active: BpmnIqSessionActive | null): Promise<void> {
        const url = `${this.baseUrl}/api/session/active`;
        if (active === null) {
            const res = await fetch(url, { method: "DELETE" });
            if (!res.ok) {
                throw new Error(`DELETE /api/session/active failed: ${res.status}`);
            }
            return;
        }
        const body: Record<string, string> = { modelId: active.modelId };
        if (active.elementId) body.elementId = active.elementId;
        const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            throw new Error(`POST /api/session/active failed: ${res.status}`);
        }
    }
}
