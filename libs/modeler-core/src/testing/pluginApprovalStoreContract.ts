import { beforeEach, describe, expect, it } from "vitest";

import { allowanceRowOf } from "../kernel/domain/allowance";
import { CodeApproval, codeApprovalChange, revoking } from "../kernel/domain/codeApproval";
import { PluginApprovalStorePort } from "../kernel/port/approvalPorts";

/** One {@link PluginApprovalStorePort} adapter under the {@link describePluginApprovalStoreContract} scenarios. */
export interface PluginApprovalStoreContractFixture {
    /** Holds no approval yet. */
    readonly store: PluginApprovalStorePort;
    /**
     * Another writer stores `approvals` where the store keeps them, as another
     * IDE project or window does. With `notify` the store hears of it as the
     * host tells it (IntelliJ pushes the list, VS Code re-reads it when the
     * window gains focus); without, it does not.
     */
    storeElsewhere(
        approvals: readonly CodeApproval[],
        options?: { readonly notify?: boolean },
    ): Promise<void>;
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

const allowingRows = (artifacts: readonly { id: string; contentHash: string }[]) =>
    codeApprovalChange(artifacts.map(rowOf), []);

/** Its id is a JSON array holding quotes, brackets, commas and a path, which no host may reshape. */
const ALLOWANCE_ROW = allowanceRowOf({
    kind: "plugin",
    host: 'ssh-remote+"box",1',
    origin: { kind: "repository", path: 'C:/work/[repo], "main"/.git' },
    addOn: ".camunda/plugins/resize, tasks",
});

/**
 * The rules of {@link PluginApprovalStorePort} the core relies on, run against
 * one adapter. A store with no approvals reads `[]`. A change is merged into
 * the list the host stores, so a row the change does not name stays, also
 * one another writer stored that this store never read, and a read right
 * after the change includes it. A change that names an id twice rejects and
 * stores nothing. `readStored` asks the host for its list rather than a
 * mirror, and `read` returns what it answered from then on. `onDidChange`
 * fires once whenever the store learns of a new list (its own change, the
 * host telling it, or `readStored`), and never for a list of the same rows.
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

        it("keeps an allowance row unchanged, its id's quotes, brackets and commas included", async () => {
            await fixture.store.change(codeApprovalChange([ALLOWANCE_ROW], []));

            expect(fixture.store.read()).toEqual([ALLOWANCE_ROW]);
            expect(await fixture.store.readStored()).toEqual([ALLOWANCE_ROW]);
        });

        it("reads an allowed row back once the change resolved", async () => {
            await fixture.store.change(allowingRows([PALETTE, RESIZE]));

            expect(fixture.store.read()).toEqual([rowOf(PALETTE), rowOf(RESIZE)]);
        });

        it("replaces a row in place, revokes another and keeps the rows the change does not name", async () => {
            await fixture.store.change(allowingRows([RESIZE, PALETTE, ACME]));

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
            await fixture.store.change(allowingRows([RESIZE]));
            await fixture.storeElsewhere([rowOf(RESIZE), rowOf(ACME)]);

            await fixture.store.change(allowingRows([PALETTE]));

            expect(fixture.store.read()).toEqual([rowOf(RESIZE), rowOf(ACME), rowOf(PALETTE)]);
        });

        it("does not bring back a revoked row with a later allow of another one", async () => {
            await fixture.store.change(allowingRows([RESIZE, PALETTE]));
            await fixture.store.change(revoking([RESIZE.id]));

            await fixture.store.change(allowingRows([ACME]));

            expect(fixture.store.read()).toEqual([rowOf(PALETTE), rowOf(ACME)]);
        });

        it("rejects a change that names an id twice and stores nothing", async () => {
            await fixture.store.change(allowingRows([RESIZE]));

            await expect(
                fixture.store.change({ allow: [rowOf(PALETTE)], revoke: [PALETTE.id] }),
            ).rejects.toThrow();
            await fixture.store.change(allowingRows([ACME]));

            expect(fixture.store.read()).toEqual([rowOf(RESIZE), rowOf(ACME)]);
        });

        it("keeps both rows of two changes started together", async () => {
            await Promise.all([
                fixture.store.change(allowingRows([RESIZE])),
                fixture.store.change(allowingRows([PALETTE])),
            ]);

            expect(fixture.store.read()).toEqual([rowOf(RESIZE), rowOf(PALETTE)]);
        });

        it("reads the list another writer stored once readStored answered it", async () => {
            await fixture.store.change(allowingRows([RESIZE]));
            await fixture.storeElsewhere([rowOf(ACME), rowOf(RESIZE)]);

            const stored = await fixture.store.readStored();

            expect(stored).toEqual([rowOf(ACME), rowOf(RESIZE)]);
            expect(fixture.store.read()).toEqual([rowOf(ACME), rowOf(RESIZE)]);
        });

        it("announces each change once and no change that keeps every row", async () => {
            let announced = 0;
            fixture.store.onDidChange(() => announced++);

            await fixture.store.change(allowingRows([RESIZE]));
            await fixture.store.change(allowingRows([RESIZE]));
            await fixture.store.change(revoking([PALETTE.id]));
            await fixture.store.change(revoking([RESIZE.id]));

            expect(announced).toBe(2);
        });

        it("announces a list another writer stored once the store hears of it", async () => {
            const announced: (readonly CodeApproval[])[] = [];
            fixture.store.onDidChange(() => announced.push(fixture.store.read()));

            await fixture.storeElsewhere([rowOf(ACME)], { notify: true });

            expect(announced).toEqual([[rowOf(ACME)]]);
        });

        it("announces a list readStored found changed, and not the same rows again", async () => {
            await fixture.store.change(allowingRows([RESIZE]));
            let announced = 0;
            fixture.store.onDidChange(() => announced++);
            await fixture.storeElsewhere([rowOf(RESIZE), rowOf(ACME)]);

            await fixture.store.readStored();
            await fixture.store.readStored();

            expect(announced).toBe(1);
        });

        it("announces nothing to a listener it disposed", async () => {
            let announced = 0;
            const subscription = fixture.store.onDidChange(() => announced++);
            await fixture.store.change(allowingRows([RESIZE]));

            subscription.dispose();
            await fixture.store.change(allowingRows([PALETTE]));
            await fixture.storeElsewhere([rowOf(ACME)], { notify: true });

            expect(announced).toBe(1);
        });

        it("reads no approvals once every row is revoked", async () => {
            await fixture.store.change(allowingRows([RESIZE]));

            await fixture.store.change(revoking([RESIZE.id]));

            expect(fixture.store.read()).toEqual([]);
        });
    });
}
