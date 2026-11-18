import { describe, expect, it } from "vitest";

import { RunMergePaneCommandQuery } from "@miragon/bpmn-modeler-shared";

import {
    createTestHost,
    FakeDiffPaneHandle,
    mergeSessionOf,
    ORDER_MERGE_STAGES,
    RecordingMergePaneCommandKeys,
    RecordingMergeSidesView,
} from "../../testing";
import { DiffPaneStore } from "./DiffPaneStore";
import { MergeDecisionService } from "./MergeDecisionService";
import { MergePaneCommandService } from "./MergePaneCommandService";
import { MergeSessionStore } from "./MergeSessionStore";

const URIS = {
    current: "bpmn-merge:/repo/order.current.bpmn?side%3Dcurrent%26opening%3D1",
    incoming: "bpmn-merge:/repo/order.incoming.bpmn?side%3Dincoming%26opening%3D1",
};

const RESULT_URIS = {
    stage: "bpmn-merge:/repo/order.incoming.bpmn?side%3Dincoming%26opening%3D2",
    result: "bpmn-merge:/repo/order.result.bpmn?side%3Dresult%26opening%3D2",
};

/** A merge view's two panes, its result comparison's and a plain diff's, on one host. */
async function keyboardHost() {
    const { notifier } = createTestHost();
    const store = new DiffPaneStore();
    const sessions = new MergeSessionStore(store, new RecordingMergeSidesView());
    const keys = new RecordingMergePaneCommandKeys();
    const service = new MergePaneCommandService(
        store,
        new MergeDecisionService(sessions, notifier),
        keys,
    );
    const mergeSession = store.registerMerge(URIS);
    sessions.add(
        await mergeSessionOf({
            fileUri: "file:///repo/order.bpmn",
            fileName: "order.bpmn",
            title: "order.bpmn (Merge: main ↔ feature)",
            captions: {
                current: { side: "current", role: "branch", ref: "main" },
                incoming: { side: "incoming", role: "upstream", ref: "feature" },
            },
            uris: URIS,
            stages: ORDER_MERGE_STAGES,
        }),
        mergeSession,
    );
    const current = new FakeDiffPaneHandle(URIS.current);
    const incoming = new FakeDiffPaneHandle(URIS.incoming);
    mergeSession.attachPane(current);
    mergeSession.attachPane(incoming);
    const comparison = store.registerResultComparison(RESULT_URIS.stage, RESULT_URIS.result);
    const comparisonPane = new FakeDiffPaneHandle(RESULT_URIS.result);
    comparison.attachPane(new FakeDiffPaneHandle(RESULT_URIS.stage));
    comparison.attachPane(comparisonPane);
    const plainDiff = store.registerCompareFiles("file:///repo/a.bpmn", "file:///repo/b.bpmn");
    const plainPane = new FakeDiffPaneHandle("file:///repo/b.bpmn");
    plainDiff.attachPane(new FakeDiffPaneHandle("file:///repo/a.bpmn"));
    plainDiff.attachPane(plainPane);
    return { service, keys, current, incoming, comparisonPane, plainPane };
}

const runsOf = (pane: FakeDiffPaneHandle) =>
    pane.posted
        .filter((message): message is RunMergePaneCommandQuery => {
            return (message as { type: string }).type === "RunMergePaneCommandQuery";
        })
        .map(({ command }) => command);

describe("MergePaneCommandService", () => {
    it("offers what the focused merge pane reported, and its keys act", async () => {
        const { service, keys, current } = await keyboardHost();
        service.report(current, ["keep", "next", "previous", "build"]);

        service.focus(current);

        expect(keys.current).toStrictEqual({
            focused: true,
            targeted: true,
            available: ["keep", "next", "previous", "build"],
        });
    });

    it("follows the focused pane's reports, not its partner's", async () => {
        const { service, keys, current, incoming } = await keyboardHost();
        service.focus(current);

        service.report(current, ["undo", "build"]);
        service.report(incoming, ["keep", "build"]);

        expect(keys.current.available).toStrictEqual(["undo", "build"]);
    });

    it("offers the partner's commands once the partner takes the focus", async () => {
        const { service, keys, current, incoming } = await keyboardHost();
        service.report(current, ["undo", "build"]);
        service.report(incoming, ["keep", "build"]);
        service.focus(current);

        service.focus(incoming);

        expect(keys.current).toStrictEqual({
            focused: true,
            targeted: true,
            available: ["keep", "build"],
        });
    });

    it("keeps the pane the target while the Command Palette has the focus, so only the palette offers them", async () => {
        const { service, keys, current } = await keyboardHost();
        service.report(current, ["keep", "build"]);
        service.focus(current);

        service.blur(current);

        expect(keys.current).toStrictEqual({
            focused: false,
            targeted: true,
            available: ["keep", "build"],
        });
    });

    it.each(["comparisonPane", "plainPane"] as const)(
        "offers nothing while a %s that is no merge pane has the focus",
        async (other) => {
            const host = await keyboardHost();
            host.service.report(host.current, ["keep", "build"]);
            host.service.focus(host.current);

            host.service.focus(host[other]);

            expect(host.keys.current).toStrictEqual({
                focused: false,
                targeted: false,
                available: [],
            });
        },
    );

    it("offers nothing once the focus moved to another editor or the pane's tab hid or closed", async () => {
        const { service, keys, current, incoming } = await keyboardHost();
        service.report(current, ["keep", "build"]);
        service.focus(current);

        service.leave(incoming);
        expect(keys.current.targeted).toBe(true);
        service.leave(current);

        expect(keys.current).toStrictEqual({ focused: false, targeted: false, available: [] });
    });

    it("runs a command on the target pane only, also while the Command Palette has the focus", async () => {
        const { service, current, incoming, comparisonPane } = await keyboardHost();
        service.focus(current);
        service.blur(current);

        await service.run("keep");

        expect(runsOf(current)).toStrictEqual(["keep"]);
        expect(runsOf(incoming)).toStrictEqual([]);
        expect(runsOf(comparisonPane)).toStrictEqual([]);
    });

    it("runs nothing without a merge pane as the target", async () => {
        const { service, current, comparisonPane } = await keyboardHost();
        await service.run("build");
        service.focus(current);
        service.focus(comparisonPane);

        await service.run("build");

        expect(runsOf(current)).toStrictEqual([]);
        expect(runsOf(comparisonPane)).toStrictEqual([]);
    });
});
