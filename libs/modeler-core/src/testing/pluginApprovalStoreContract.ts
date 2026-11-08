import { beforeEach, describe, expect, it } from "vitest";

import { CodeApproval } from "../kernel/domain/codeApproval";
import { PluginApprovalStorePort } from "../kernel/port/approvalPorts";

/** One {@link PluginApprovalStorePort} adapter under the {@link describePluginApprovalStoreContract} scenarios. */
export interface PluginApprovalStoreContractFixture {
    /** Holds no approval yet. */
    readonly store: PluginApprovalStorePort;
}

const RESIZE: CodeApproval = {
    pluginId: "/repo/.camunda/plugins/resize-tasks",
    contentHash: "9f2c",
};
const PALETTE: CodeApproval = {
    pluginId: "C:/repo/.camunda/plugins/reduced-palette",
    contentHash: "41aa",
};

/**
 * The rules of {@link PluginApprovalStorePort} the core relies on, run against
 * one adapter. A store with no approvals reads `[]`. A write replaces every
 * approval with the written list, in its order, so the core removes an
 * approval by leaving it out, and a read right after the write returns it.
 *
 * Left out: where an adapter keeps the list. The rule that no workspace can
 * write it is the adapter's; VS Code keeps it in its global state.
 */
export function describePluginApprovalStoreContract(
    adapter: string,
    createFixture: () => Promise<PluginApprovalStoreContractFixture>,
): void {
    describe(`${adapter} keeps the PluginApprovalStorePort contract`, () => {
        let fixture: PluginApprovalStoreContractFixture;

        beforeEach(async () => {
            fixture = await createFixture();
        });

        it("reads no approvals before the first write", () => {
            expect(fixture.store.read()).toEqual([]);
        });

        it("reads the written approvals back, in their order", async () => {
            await fixture.store.write([PALETTE, RESIZE]);

            expect(fixture.store.read()).toEqual([PALETTE, RESIZE]);
        });

        it("replaces every approval with the written list", async () => {
            await fixture.store.write([RESIZE, PALETTE]);

            await fixture.store.write([{ ...RESIZE, contentHash: "b07e" }]);

            expect(fixture.store.read()).toEqual([{ ...RESIZE, contentHash: "b07e" }]);
        });

        it("reads no approvals once an empty list is written", async () => {
            await fixture.store.write([RESIZE]);

            await fixture.store.write([]);

            expect(fixture.store.read()).toEqual([]);
        });
    });
}
