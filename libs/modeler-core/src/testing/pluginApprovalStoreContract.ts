import { beforeEach, describe, expect, it } from "vitest";

import { allowing, CodeApproval, revoking } from "../kernel/domain/codeApproval";
import { PluginApprovalStorePort } from "../kernel/port/approvalPorts";

/** One {@link PluginApprovalStorePort} adapter under the {@link describePluginApprovalStoreContract} scenarios. */
export interface PluginApprovalStoreContractFixture {
    /** Holds no approval yet. */
    readonly store: PluginApprovalStorePort;
    /**
     * Another writer stores `approvals` where the store keeps them, as another
     * IDE project or window does, without telling the store.
     */
    storeElsewhere(approvals: readonly CodeApproval[]): Promise<void>;
}

const RESIZE = {
    id: "/repo/.camunda/plugins/resize-tasks",
    name: "Resize Tasks",
    contentHash: "9f2c",
};
const PALETTE = {
    id: "C:/repo/.camunda/plugins/reduced-palette",
    name: "Reduced Palette",
    contentHash: "41aa",
};
const ACME = {
    id: "/other/node_modules/bpmnlint-plugin-acme",
    name: "bpmnlint-plugin-acme",
    contentHash: "bpmnlint-closure-v1:d00d",
};

const rowOf = ({ id, contentHash }: { id: string; contentHash: string }): CodeApproval => ({
    pluginId: id,
    contentHash,
});

/**
 * The rules of {@link PluginApprovalStorePort} the core relies on, run against
 * one adapter. A store with no approvals reads `[]`. A change is merged into
 * the list the host stores, so a row the change does not name stays, also
 * one another writer stored that this store never read, and a read right
 * after the change includes it. A change that names an id twice rejects and
 * stores nothing.
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

        it("reads no approvals before the first change", () => {
            expect(fixture.store.read()).toEqual([]);
        });

        it("reads an allowed row back once the change resolved", async () => {
            await fixture.store.change(allowing([PALETTE, RESIZE]));

            expect(fixture.store.read()).toEqual([rowOf(PALETTE), rowOf(RESIZE)]);
        });

        it("replaces a row in place, revokes another and keeps the rows the change does not name", async () => {
            await fixture.store.change(allowing([RESIZE, PALETTE, ACME]));

            await fixture.store.change({
                allow: [{ ...rowOf(RESIZE), contentHash: "b07e" }],
                revoke: [PALETTE.id],
            });

            expect(fixture.store.read()).toEqual([
                { ...rowOf(RESIZE), contentHash: "b07e" },
                rowOf(ACME),
            ]);
        });

        it("keeps a row another writer stored that this store had not read", async () => {
            await fixture.store.change(allowing([RESIZE]));
            await fixture.storeElsewhere([rowOf(RESIZE), rowOf(ACME)]);

            await fixture.store.change(allowing([PALETTE]));

            expect(fixture.store.read()).toEqual([rowOf(RESIZE), rowOf(ACME), rowOf(PALETTE)]);
        });

        it("does not bring back a revoked row with a later allow of another one", async () => {
            await fixture.store.change(allowing([RESIZE, PALETTE]));
            await fixture.store.change(revoking([RESIZE.id]));

            await fixture.store.change(allowing([ACME]));

            expect(fixture.store.read()).toEqual([rowOf(PALETTE), rowOf(ACME)]);
        });

        it("rejects a change that names an id twice and stores nothing", async () => {
            await fixture.store.change(allowing([RESIZE]));

            await expect(
                fixture.store.change({ allow: [rowOf(PALETTE)], revoke: [PALETTE.id] }),
            ).rejects.toThrow();
            await fixture.store.change(allowing([ACME]));

            expect(fixture.store.read()).toEqual([rowOf(RESIZE), rowOf(ACME)]);
        });

        it("keeps both rows of two changes started together", async () => {
            await Promise.all([
                fixture.store.change(allowing([RESIZE])),
                fixture.store.change(allowing([PALETTE])),
            ]);

            expect(fixture.store.read()).toEqual([rowOf(RESIZE), rowOf(PALETTE)]);
        });

        it("reads no approvals once every row is revoked", async () => {
            await fixture.store.change(allowing([RESIZE]));

            await fixture.store.change(revoking([RESIZE.id]));

            expect(fixture.store.read()).toEqual([]);
        });
    });
}
