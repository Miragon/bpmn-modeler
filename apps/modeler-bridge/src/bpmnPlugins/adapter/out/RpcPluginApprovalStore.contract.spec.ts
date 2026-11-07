import { PluginApproval } from "@miragon/bpmn-modeler-core";
import { describePluginApprovalStoreContract } from "@miragon/bpmn-modeler-core/testing";

import { bindHandlers } from "../../../composition/bindHandlers";
import { createStdinHandler } from "../../../composition/stdioBinding";
import { METHODS } from "../../../protocol/domain/descriptor";
import { PluginApprovalsParams } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { pluginApprovalHandlers } from "../in/pluginApprovalHandlers";
import { RpcPluginApprovalStore } from "./RpcPluginApprovalStore";

interface CoreFrame {
    readonly id: number;
    readonly method: string;
    readonly params: PluginApprovalsParams;
}

/**
 * IntelliJ's `PluginApprovalRouter` over its application-level
 * `PluginApprovalStore`: a save stores the list, pushes it to every running
 * bridge in `pluginApprovals/didChange`, then acks an empty reply, all from
 * the host's reader thread after the request left the bridge.
 */
class IntellijPluginApprovalStore {
    private approvals: PluginApproval[] = [];

    constructor(private readonly sendToBridge: (chunk: string) => void) {}

    receive(line: string): void {
        const { id, method, params } = JSON.parse(line) as CoreFrame;
        setTimeout(() => {
            const frames =
                method === METHODS.pluginApprovalsSave
                    ? this.save(id, params)
                    : [{ id, error: `No handler for ${method}` }];
            this.sendToBridge(frames.map((frame) => `${JSON.stringify(frame)}\n`).join(""));
        }, 0);
    }

    private save(id: number, { approvals }: PluginApprovalsParams): object[] {
        this.approvals = approvals.map(({ pluginId, contentHash }) => ({ pluginId, contentHash }));
        return [
            { method: METHODS.pluginApprovalsDidChange, params: { approvals: this.approvals } },
            { id, result: null },
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
        return { store };
    },
);
