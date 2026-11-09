import { describe, expect, it } from "vitest";

import {
    hostErrorReply,
    hostNotification,
    hostReply,
} from "../../../__fixtures__/bridgeHarness";
import { bindHandlers } from "../../../composition/bindHandlers";
import { METHODS } from "../../../protocol/domain/descriptor";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { pluginApprovalHandlers } from "../in/pluginApprovalHandlers";
import { RpcPluginApprovalStore } from "./RpcPluginApprovalStore";

const RESIZE = { pluginId: "/ws/.camunda/plugins/resize-tasks", contentHash: "9f2c" };
const PALETTE = { pluginId: "/ws/.camunda/plugins/reduced-palette", contentHash: "41aa" };
const OTHER = { pluginId: "/other/.camunda/plugins/colors", contentHash: "c010" };

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
            hostNotification(METHODS.pluginApprovalsDidChange, {
                approvals: [RESIZE, PALETTE],
                revision: 2,
            }),
        );

        expect(store.read()).toEqual([RESIZE, PALETTE]);
    });

    it("sends only the change and reads the list the host answers with", async () => {
        const { rpc, store, frames } = bridgeStore();
        store.apply({ approvals: [RESIZE], revision: 1 });

        const changed = store.change({ allow: [PALETTE], revoke: [] });
        await rpc.handleLine(
            hostReply(frames[0].id!, { approvals: [OTHER, PALETTE], revision: 2 }),
        );
        await changed;

        expect(frames[0]).toMatchObject({
            method: METHODS.pluginApprovalsChange,
            params: { allow: [PALETTE], revoke: [] },
        });
        expect(store.read()).toEqual([OTHER, PALETTE]);
    });

    it("keeps its approvals when the host refuses the change", async () => {
        const { rpc, store, frames } = bridgeStore();
        store.apply({ approvals: [RESIZE], revision: 1 });

        const changed = store.change({ allow: [PALETTE], revoke: [] });
        await rpc.handleLine(hostErrorReply(frames[0].id!, "PropertiesComponent is gone"));

        await expect(changed).rejects.toThrow("PropertiesComponent is gone");
        expect(store.read()).toEqual([RESIZE]);
    });

    it("keeps a newer pushed list over an answer the host sent before it", async () => {
        const { rpc, store, frames } = bridgeStore();

        const changed = store.change({ allow: [PALETTE], revoke: [] });
        await rpc.handleLine(
            hostNotification(METHODS.pluginApprovalsDidChange, {
                approvals: [PALETTE, OTHER],
                revision: 3,
            }),
        );
        await rpc.handleLine(hostReply(frames[0].id!, { approvals: [PALETTE], revision: 2 }));
        await changed;

        expect(store.read()).toEqual([PALETTE, OTHER]);
    });

    it("keeps its list for a push of the revision it already holds", () => {
        const { store } = bridgeStore();
        store.apply({ approvals: [RESIZE], revision: 4 });

        store.apply({ approvals: [], revision: 4 });

        expect(store.read()).toEqual([RESIZE]);
    });
});
