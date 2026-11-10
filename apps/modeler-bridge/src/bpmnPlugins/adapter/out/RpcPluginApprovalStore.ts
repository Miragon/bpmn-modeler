import {
    approvalsKey,
    CodeApprovalChange,
    PluginApproval,
    PluginApprovalStorePort,
} from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../protocol/domain/descriptor";
import {
    EmptyParams,
    PluginApprovalsChangeParams,
    PluginApprovalsSnapshot,
} from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { PluginApprovalsMirror } from "../../port/PluginApprovalsMirror";

/**
 * IntelliJ's application-level approval store, mirrored for the core's
 * synchronous `read()`. The host seeds the mirror after every spawn and on
 * `session/register`, and pushes every list it stores in
 * `pluginApprovals/didChange` to every running bridge of the IDE.
 *
 * The host is the writer of record: `change` sends only the rows to allow and
 * the ids to revoke, the host merges them into the list it stores and answers
 * with that list. A refused change leaves the mirror as it was. `readStored`
 * asks the host for its list rather than trusting the mirror, and answers a
 * newer list the host pushed before its answer arrived.
 *
 * Every list carries the host's revision and the mirror keeps the newest: the
 * bridge runs a register on its editor's queue and a push on its own, so they
 * can apply out of the host's order, and a reply can arrive after a newer push.
 */
export class RpcPluginApprovalStore implements PluginApprovalStorePort, PluginApprovalsMirror {
    // A respawned bridge starts below the host's first revision.
    private snapshot: PluginApprovalsSnapshot = { approvals: [], revision: 0 };
    private readonly listeners = new Set<() => void>();

    constructor(private readonly rpc: Rpc) {}

    read(): readonly PluginApproval[] {
        return this.snapshot.approvals;
    }

    async change({ allow, revoke }: CodeApprovalChange): Promise<void> {
        const stored = (await this.rpc.request(METHODS.pluginApprovalsChange, {
            allow: copyOf(allow),
            revoke: [...revoke],
        } satisfies PluginApprovalsChangeParams)) as PluginApprovalsSnapshot;
        this.apply(stored);
    }

    async readStored(): Promise<readonly PluginApproval[]> {
        const stored = (await this.rpc.request(
            METHODS.pluginApprovalsRead,
            {} satisfies EmptyParams,
        )) as PluginApprovalsSnapshot;
        this.apply(stored);
        return copyOf(this.snapshot.approvals);
    }

    onDidChange(listener: () => void): { dispose(): void } {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }

    apply({ approvals, revision }: PluginApprovalsSnapshot): void {
        if (revision <= this.snapshot.revision) return;
        const changed = approvalsKey(approvals) !== approvalsKey(this.snapshot.approvals);
        this.snapshot = { approvals: copyOf(approvals), revision };
        if (changed) this.listeners.forEach((listener) => listener());
    }
}

function copyOf(approvals: readonly PluginApproval[]): PluginApproval[] {
    return approvals.map(({ pluginId, contentHash }) => ({ pluginId, contentHash }));
}
