import { describe, expect, it } from "vitest";

import { hostErrorReply, hostNotification } from "../../../__fixtures__/bridgeHarness";
import { bindHandlers } from "../../../composition/bindHandlers";
import { METHODS } from "../../../protocol/domain/descriptor";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { pluginApprovalHandlers } from "../in/pluginApprovalHandlers";
import { RpcPluginApprovalStore } from "./RpcPluginApprovalStore";

const RESIZE = { pluginId: "/ws/.camunda/plugins/resize-tasks", contentHash: "9f2c" };
const PALETTE = { pluginId: "/ws/.camunda/plugins/reduced-palette", contentHash: "41aa" };

function bridgeStore() {
    const frames: Array<{ id?: number; method: string; params: unknown }> = [];
    const rpc = new Rpc((line) => frames.push(JSON.parse(line)));
    const store = new RpcPluginApprovalStore(rpc);
    bindHandlers(rpc, pluginApprovalHandlers(store));
    return { rpc, store, frames };
}

describe("RpcPluginApprovalStore", () => {
    it("reads the approvals another bridge of the IDE saved, once the host pushes them", async () => {
        const { rpc, store } = bridgeStore();

        await rpc.handleLine(
            hostNotification(METHODS.pluginApprovalsDidChange, { approvals: [RESIZE, PALETTE] }),
        );

        expect(store.read()).toEqual([RESIZE, PALETTE]);
    });

    it("keeps its approvals when the host refuses to store the written ones", async () => {
        const { rpc, store, frames } = bridgeStore();
        store.apply([RESIZE]);

        const written = store.write([PALETTE]);
        await rpc.handleLine(hostErrorReply(frames[0].id!, "PropertiesComponent is gone"));

        await expect(written).rejects.toThrow("PropertiesComponent is gone");
        expect(frames[0]).toMatchObject({
            method: METHODS.pluginApprovalsSave,
            params: { approvals: [PALETTE] },
        });
        expect(store.read()).toEqual([RESIZE]);
    });
});
