import { WorkspaceTrustPort } from "@miragon/bpmn-modeler-core";

import { WorkspaceTrustSnapshot } from "../../../protocol/domain/types";
import { WorkspaceTrustMirror } from "../../port/WorkspaceTrustMirror";

/**
 * IntelliJ's trust of the project, mirrored for the core's synchronous read.
 * Untrusted until the host says otherwise, so no workspace code runs before
 * the first snapshot. The host sends one with `session/register` and after
 * every spawn, and pushes `workspaceTrust/didChange` when the IDE's trust
 * changes. A register runs on its editor's queue and a push on its own, so
 * the mirror keeps the newest revision rather than the last one applied.
 */
export class HostWorkspaceTrust implements WorkspaceTrustPort, WorkspaceTrustMirror {
    // A respawned bridge starts below the host's first revision.
    private snapshot: WorkspaceTrustSnapshot = { trusted: false, revision: 0 };
    private readonly listeners = new Set<() => void>();

    isTrusted(): boolean {
        return this.snapshot.trusted;
    }

    onDidChange(listener: () => void): { dispose(): void } {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }

    apply({ trusted, revision }: WorkspaceTrustSnapshot): void {
        if (revision <= this.snapshot.revision) return;
        const changed = trusted !== this.snapshot.trusted;
        this.snapshot = { trusted, revision };
        if (changed) this.listeners.forEach((listener) => listener());
    }
}
