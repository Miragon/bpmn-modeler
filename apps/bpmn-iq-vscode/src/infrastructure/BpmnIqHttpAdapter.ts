import {
    DaemonClient,
    type SessionActive,
    type WorkspaceMeta,
    type WorkspaceModelEntry,
} from "@miragon/bpmn-iq-daemon-client";

import type { BpmnIqPort, BpmnIqSseEvent } from "../domain/port";
import { decodeSseEvent } from "../domain/sseDecode";

/**
 * `BpmnIqPort` implementation that delegates everything to the upstream
 * `@miragon/bpmn-iq-daemon-client`.  All wire-format concerns (envelope
 * parsing, session-active endpoint, response shapes) live in the lib;
 * this adapter is now a thin bridge between {@link BpmnIqPort} and
 * {@link DaemonClient}.
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

    registerWorkspace(opts: {
        name: string;
        repoId?: string;
        repoSlug?: string;
        branch?: string;
    }): Promise<void> {
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

    listWorkspaceModels(): Promise<{
        workspace: WorkspaceMeta;
        models: WorkspaceModelEntry[];
    }> {
        return this.client.listWorkspaceModels(this.workspaceId);
    }

    async streamEvents(
        onEvent: (event: BpmnIqSseEvent) => void,
        signal: AbortSignal,
    ): Promise<void> {
        await this.client.streamEvents((e) => {
            const mapped = decodeSseEvent(e, this.workspaceId);
            if (mapped) onEvent(mapped);
        }, signal);
    }

    setSessionActive(active: SessionActive): Promise<void> {
        return this.client.setSessionActive(active);
    }
}
