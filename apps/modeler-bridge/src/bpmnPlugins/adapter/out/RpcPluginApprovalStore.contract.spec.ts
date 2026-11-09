import { approvalsAfter, PluginApproval } from "@miragon/bpmn-modeler-core";
import { describePluginApprovalStoreContract } from "@miragon/bpmn-modeler-core/testing";

import { bindHandlers } from "../../../composition/bindHandlers";
import { createStdinHandler } from "../../../composition/stdioBinding";
import { METHODS } from "../../../protocol/domain/descriptor";
import { PluginApprovalsChangeParams } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { pluginApprovalHandlers } from "../in/pluginApprovalHandlers";
import { RpcPluginApprovalStore } from "./RpcPluginApprovalStore";

interface CoreFrame {
    readonly id: number;
    readonly method: string;
    readonly params: PluginApprovalsChangeParams;
}

/**
 * IntelliJ's `PluginApprovalRouter` over its application-level
 * `PluginApprovalStore`: a change is merged into the stored list at the next
 * revision, which goes to every running bridge in `pluginApprovals/didChange`
 * and then answers the request, all from the host's reader thread after the request left the
 * bridge. An overlapping change answers an error and stores nothing.
 */
class IntellijPluginApprovalStore {
    approvals: PluginApproval[] = [];
    revision = 1;

    constructor(private readonly sendToBridge: (chunk: string) => void) {}

    receive(line: string): void {
        const { id, method, params } = JSON.parse(line) as CoreFrame;
        setTimeout(() => {
            const frames =
                method === METHODS.pluginApprovalsChange
                    ? this.change(id, params)
                    : [{ id, error: `No handler for ${method}` }];
            this.sendToBridge(frames.map((frame) => `${JSON.stringify(frame)}\n`).join(""));
        }, 0);
    }

    private change(id: number, change: PluginApprovalsChangeParams): object[] {
        try {
            this.approvals = approvalsAfter(this.approvals, change);
        } catch (error) {
            return [{ id, error: String(error) }];
        }
        this.revision++;
        const snapshot = { approvals: this.approvals, revision: this.revision };
        return [
            { method: METHODS.pluginApprovalsDidChange, params: snapshot },
            { id, result: snapshot },
        ];
    }
}

describePluginApprovalStoreContract(
    "RpcPluginApprovalStore over a loopback to IntelliJ's application store",
    async () => {
        let fromHost: (chunk: string) => void = () => undefined;
        const host = new IntellijPluginApprovalStore((chunk) => fromHost(chunk));
        const rpc = new Rpc((line) => host.receive(line));
        fromHost = createStdinHandler(rpc, (text) => {
            throw new Error(text);
        });
        const store = new RpcPluginApprovalStore(rpc);
        bindHandlers(rpc, pluginApprovalHandlers(store));
        return {
            store,
            storeElsewhere: async (approvals) => {
                host.approvals = [...approvals];
                host.revision++;
            },
        };
    },
);
