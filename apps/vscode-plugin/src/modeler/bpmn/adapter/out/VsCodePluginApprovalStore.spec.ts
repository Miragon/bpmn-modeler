import { describe, expect, it } from "vitest";

import { FailingMemento } from "../../../../__fixtures__/vscodeStorage";
import { VsCodePluginApprovalStore } from "./VsCodePluginApprovalStore";

const RESIZE = { pluginId: "/ws/.camunda/plugins/resize-tasks", contentHash: "9f2c" };

describe("VsCodePluginApprovalStore", () => {
    it.each([
        { keepsRejectedValue: true, announced: 1 },
        { keepsRejectedValue: false, announced: 0 },
    ])(
        "announces a rejected write only when the memento kept its value (keeps: $keepsRejectedValue)",
        async ({ keepsRejectedValue, announced }) => {
            const globalState = new FailingMemento(keepsRejectedValue);
            globalState.failAfter(0, "disk full");
            const store = new VsCodePluginApprovalStore(globalState);
            let announcements = 0;
            store.onDidChange(() => announcements++);

            await expect(store.change({ allow: [RESIZE], revoke: [] })).rejects.toThrow("disk full");

            expect(announcements).toBe(announced);
            expect(store.read()).toEqual(keepsRejectedValue ? [RESIZE] : []);
        },
    );
});
