import { describe, expect, it, vi } from "vitest";

import { InMemoryPluginApprovals, RecordingNotifier } from "../../testing";
import {
    approvalsAfter,
    ApprovableArtifact,
    CarriedApproval,
    CodeApproval,
    CodeApprovalChange,
    revoking,
} from "../domain/codeApproval";
import { CarriedApprovalWriter } from "./CarriedApprovalWriter";

const HERE: ApprovableArtifact = {
    id: "/worktree/.camunda/plugins/resize",
    name: "Resize",
    contentHash: "a".repeat(64),
};
const SOURCE: CodeApproval = {
    pluginId: "/repo/.camunda/plugins/resize",
    contentHash: HERE.contentHash,
};
const HERE_ROW: CodeApproval = { pluginId: HERE.id, contentHash: HERE.contentHash };

const texts = {
    carriedOver: ({ artifact, allowedAt }: CarriedApproval) =>
        `Allowed ${artifact.name} in ${artifact.id}: you allowed it in ${allowedAt}.`,
};
const CARRIED_LINE = `Allowed Resize in ${HERE.id}: you allowed it in ${SOURCE.pluginId}.`;

/** A mirror that has not heard of every row the host stores yet, as the bridge's can lag. */
class MirrorBehindHost extends InMemoryPluginApprovals {
    mirrored: readonly CodeApproval[] = [];

    override read(): readonly CodeApproval[] {
        return this.mirrored;
    }
}

/** A host that cannot answer for the approvals it stores. */
class UnanswerableHost extends InMemoryPluginApprovals {
    override readStored(): Promise<readonly CodeApproval[]> {
        return Promise.reject(new Error("host gone"));
    }
}

/** Applies each change after the one before it, a task later, and answers for its list at once, as VS Code's store does. */
class ChainedHost extends InMemoryPluginApprovals {
    private changes: Promise<void> = Promise.resolve();

    override change(change: CodeApprovalChange): Promise<void> {
        const changed = this.changes.then(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
            this.approvals = approvalsAfter(this.approvals, change);
        });
        this.changes = changed.catch(() => undefined);
        return changed;
    }
}

function setUp(store = new InMemoryPluginApprovals()) {
    const logger = new RecordingNotifier();
    return { store, logger, carried: new CarriedApprovalWriter(store, logger, texts) };
}

describe("CarriedApprovalWriter", () => {
    it("stores a row for code allowed only in another folder and logs one line naming both", async () => {
        const { store, logger, carried } = setUp();
        store.approvals = [SOURCE];

        await carried.record([HERE]);

        expect(store.approvals).toEqual([SOURCE, HERE_ROW]);
        expect(logger.logged("info")).toEqual([CARRIED_LINE]);
    });

    it("stores nothing and asks the host nothing when every place has its row", async () => {
        const { store, logger, carried } = setUp(new UnanswerableHost());
        store.approvals = [SOURCE, HERE_ROW];

        await carried.record([HERE]);

        expect(store.approvals).toEqual([SOURCE, HERE_ROW]);
        expect(logger.loggedErrors).toEqual([]);
        expect(logger.logged("info")).toEqual([]);
    });

    it("decides again from the host's list, which another writer may have brought up to date", async () => {
        const store = new MirrorBehindHost();
        const { logger, carried } = setUp(store);
        store.mirrored = [SOURCE];
        store.approvals = [SOURCE, HERE_ROW];

        await carried.record([HERE]);

        expect(store.approvals).toEqual([SOURCE, HERE_ROW]);
        expect(logger.logged("info")).toEqual([]);
    });

    it("takes its row back when a revoke of the content landed before it", async () => {
        const { store, logger, carried } = setUp();
        store.approvals = [SOURCE];
        const change = store.change.bind(store);
        vi.spyOn(store, "change").mockImplementationOnce(async (allow) => {
            await change(revoking([SOURCE.pluginId]));
            await change(allow);
        });

        await carried.record([HERE]);

        expect(store.approvals).toEqual([]);
        expect(logger.logged("info")).toEqual([]);
    });

    it("stores nothing for two batches of one content after a revoke of its only source", async () => {
        const { store, logger, carried } = setUp(new ChainedHost());
        const copy: ApprovableArtifact = {
            ...HERE,
            id: "/second-worktree/.camunda/plugins/resize",
        };
        store.approvals = [SOURCE];
        const revoke = store.change(revoking([SOURCE.pluginId]));

        await Promise.all([revoke, carried.record([HERE]), carried.record([copy])]);

        expect(store.approvals).toEqual([]);
        expect(logger.logged("info")).toEqual([]);
    });

    it("leaves a place stored twice alone when only its own later row holds the content", async () => {
        const { store, logger, carried } = setUp();
        const olderRow: CodeApproval = { pluginId: HERE.id, contentHash: "b".repeat(64) };
        store.approvals = [olderRow, HERE_ROW];

        await carried.record([HERE]);

        expect(store.approvals).toEqual([olderRow, HERE_ROW]);
        expect(logger.logged("info")).toEqual([]);
    });

    it("writes once for two concurrent calls", async () => {
        const { store, logger, carried } = setUp();
        store.approvals = [SOURCE];

        await Promise.all([carried.record([HERE]), carried.record([HERE])]);

        expect(store.approvals).toEqual([SOURCE, HERE_ROW]);
        expect(logger.logged("info")).toEqual([CARRIED_LINE]);
    });

    it("logs a failed write once, does not retry it and never rejects", async () => {
        const { store, logger, carried } = setUp();
        store.approvals = [SOURCE];
        vi.spyOn(store, "change").mockRejectedValue(new Error("disk full"));

        await carried.record([HERE]);
        await carried.record([HERE]);

        expect(store.approvals).toEqual([SOURCE]);
        expect(logger.loggedErrors.map(({ message }) => message)).toEqual([
            `Could not record the approval of ${HERE.id}, allowed through the same content elsewhere: disk full`,
        ]);
    });

    it("logs once when the host cannot answer for its list", async () => {
        const store = new UnanswerableHost();
        const { logger, carried } = setUp(store);
        store.approvals = [SOURCE];

        await carried.record([HERE]);

        expect(logger.loggedErrors.map(({ message }) => message)).toEqual([
            `Could not record the approval of ${HERE.id}, allowed through the same content elsewhere: host gone`,
        ]);
    });

    it("carries again after a revoke and a new allow", async () => {
        const { store, logger, carried } = setUp();
        store.approvals = [SOURCE];
        await carried.record([HERE]);
        await store.change(revoking([SOURCE.pluginId, HERE.id]));
        await store.change({ allow: [SOURCE], revoke: [] });

        await carried.record([HERE]);

        expect(store.approvals).toEqual([SOURCE, HERE_ROW]);
        expect(logger.logged("info")).toEqual([CARRIED_LINE, CARRIED_LINE]);
    });
});
