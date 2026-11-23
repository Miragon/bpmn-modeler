import { describe, expect, it, vi } from "vitest";

import {
    type ApplyMergeStatesQuery,
    type MergePaneOutcome,
    PickMergeSideCommand,
} from "@miragon/bpmn-modeler-shared";
import { readConflictMarkers } from "@miragon/bpmn-modeler-types";

import {
    createTestHost,
    FakeDiffPaneHandle,
    mergeSessionOf,
    ORDER_MERGE_STAGES,
    RecordingElementXmlMergeEditor,
    RecordingMergeSidesView,
} from "../../testing";
import { BpmnDiffService } from "./BpmnDiffService";
import { createDiffPaneRouter } from "./diffPaneRouter";
import { DiffPaneStore } from "./DiffPaneStore";
import { ElementXmlMergeService } from "./ElementXmlMergeService";
import { MergeDecisionService } from "./MergeDecisionService";
import { MergeSessionStore } from "./MergeSessionStore";

const FILE_URI = "file:///repo/order.bpmn";

const urisOf = (opening: number) => ({
    current: `bpmn-merge:/repo/order.current.bpmn?side%3Dcurrent%26opening%3D${opening}`,
    incoming: `bpmn-merge:/repo/order.incoming.bpmn?side%3Dincoming%26opening%3D${opening}`,
});

const CAPTIONS = {
    current: { side: "current", role: "branch", ref: "main" },
    incoming: { side: "incoming", role: "upstream", ref: "feature" },
} as const;

/** A host whose merge view of ORDER_MERGE_STAGES has both panes ready; Task_Pack's three texts differ. */
async function xmlMergeHost({ available = true } = {}) {
    const { notifier, settings } = createTestHost();
    const store = new DiffPaneStore();
    const sessions = new MergeSessionStore(store, new RecordingMergeSidesView());
    const decisions = new MergeDecisionService(sessions, notifier);
    let finishing: Promise<void> = Promise.resolve();
    let finishes: ElementXmlMergeService | undefined = undefined;
    const editor = new RecordingElementXmlMergeEditor((key, written) => {
        finishing = finishes?.finish(key, written) ?? Promise.resolve();
    });
    const xmlMerge = new ElementXmlMergeService(
        sessions,
        decisions,
        editor,
        { ready: Promise.resolve(available) },
        notifier,
    );
    finishes = xmlMerge;
    const service = new BpmnDiffService(
        notifier,
        settings,
        store,
        undefined,
        decisions,
        undefined,
        xmlMerge,
    );

    const uris = urisOf(1);
    const diffSession = store.registerMerge(uris);
    sessions.add(
        await mergeSessionOf({
            fileUri: FILE_URI,
            fileName: "order.bpmn",
            title: "order.bpmn (Merge: main ↔ feature)",
            captions: CAPTIONS,
            uris,
            stages: ORDER_MERGE_STAGES,
        }),
        diffSession,
    );
    const attach = async (session: typeof diffSession) => {
        const current = new FakeDiffPaneHandle(uris.current, ORDER_MERGE_STAGES.current);
        const incoming = new FakeDiffPaneHandle(uris.incoming, ORDER_MERGE_STAGES.incoming);
        session.attachPane(current);
        session.attachPane(incoming);
        await service.markReady(current);
        await service.markReady(incoming);
        return { current, incoming };
    };
    const { current, incoming } = await attach(diffSession);
    const session = sessions.of(FILE_URI);
    if (!session) throw new Error("no merge session");

    /** A second tab of the same merge view, as Split Editor opens it. */
    const secondTab = async () => {
        const tab = store.registerMerge(uris);
        sessions.join(session, tab);
        return attach(tab);
    };
    const pick = (elementId: string, side: "current" | "incoming") =>
        service.pickMergeSide(current, elementId, "element", side);
    const openMerge = (elementId: string, resume?: true) =>
        service.openElementXmlMerge(current, elementId, resume);
    /** Merge XML on an element no pick decides: the pick and the merge editor in one request. */
    const pickThenMerge = (
        elementId: string,
        side?: "current" | "incoming",
        pane: FakeDiffPaneHandle = current,
    ) => service.pickMergeSideThenMergeXml(pane, { elementId, scope: "element", side });
    const openRequest = () => {
        const request = editor.openFor("Task_Pack");
        if (!request) throw new Error("no merge of Task_Pack is open");
        return request;
    };
    return {
        notifier,
        xmlMerge,
        store,
        session,
        editor,
        current,
        incoming,
        secondTab,
        diffSession,
        router: createDiffPaneRouter(service, {}),
        pick,
        openMerge,
        pickThenMerge,
        openRequest,
        finishing: () => finishing,
    };
}

function lastStatesOf(pane: FakeDiffPaneHandle): ApplyMergeStatesQuery {
    const states = pane.posted.filter(
        (message): message is ApplyMergeStatesQuery =>
            (message as { type: string }).type === "ApplyMergeStatesQuery",
    );
    const last = states.at(-1);
    if (!last) throw new Error("no states posted");
    return last;
}

const lastOutcomeOf = (pane: FakeDiffPaneHandle): MergePaneOutcome | undefined =>
    lastStatesOf(pane).states.lastOutcome;

describe("ElementXmlMergeService", () => {
    it("opens the merge editor only on an element picked with three different texts", async () => {
        const host = await xmlMergeHost();

        await host.openMerge("Task_Pack");
        expect(host.editor.openings).toStrictEqual([]);

        await host.pick("Task_Pack", "current");
        await host.openMerge("Task_Pack");

        const request = host.openRequest();
        expect(request.labels).toStrictEqual({ current: "main", incoming: "feature" });
        expect(request.current).toContain('name="Pack parcel"');
        expect(request.incoming).toContain('name="Pack box"');
        expect(readConflictMarkers(request.start).hasMarkers).toBe(true);
    });

    it("opens nothing on an element whose base equals a side", async () => {
        const host = await xmlMergeHost();
        await host.pick("Task_Check", "current");

        await host.openMerge("Task_Check");

        expect(host.editor.openings).toStrictEqual([]);
        expect(host.notifier.logged("info")).toContain(
            "Merge XML of Task_Check not opened: it is not picked, or its base equals a side.",
        );
    });

    it("brings the open editor of an element to the front instead of opening a second one", async () => {
        const host = await xmlMergeHost();
        await host.pick("Task_Pack", "current");
        await host.pick("Process_1", "incoming");
        await host.openMerge("Task_Pack");
        await host.openMerge("Process_1");

        await host.openMerge("Task_Pack");

        expect(host.editor.openings.map(({ elementId }) => elementId)).toStrictEqual([
            "Task_Pack",
            "Process_1",
        ]);
        expect(host.editor.focused?.elementId).toBe("Task_Pack");
    });

    it("takes a saved text as the element's version and shows it on every tab", async () => {
        const host = await xmlMergeHost();
        const other = await host.secondTab();
        await host.pick("Task_Pack", "current");
        await host.openMerge("Task_Pack");
        const text = host.openRequest().current.replace("Pack parcel", "Pack it");

        host.editor.saveAndClose(host.openRequest().key, text);
        await host.finishing();

        expect(host.session.decisions.handMergeOf("Task_Pack")?.side).toBe("current");
        for (const pane of [host.current, host.incoming, other.current, other.incoming]) {
            expect(lastOutcomeOf(pane)).toMatchObject({
                applied: true,
                action: "mergeByHand",
                elementId: "Task_Pack",
            });
        }
        expect(lastStatesOf(host.current).states.badges).toContainEqual(
            expect.objectContaining({
                id: "Task_Pack",
                pick: expect.objectContaining({ mergedByHand: true }),
            }),
        );
    });

    it("starts the editor of an element merged by hand from its accepted text", async () => {
        const host = await xmlMergeHost();
        await host.pick("Task_Pack", "current");
        await host.openMerge("Task_Pack");
        const text = host.openRequest().current.replace("Pack parcel", "Pack it");
        host.editor.saveAndClose(host.openRequest().key, text);
        await host.finishing();

        await host.openMerge("Task_Pack");

        expect(host.openRequest().start).toBe(
            host.session.decisions.handMergeOf("Task_Pack")?.shownText,
        );
        expect(host.openRequest().start).toContain('name="Pack it"');
    });

    it("keeps the decisions on a refused text and starts Edit again from it", async () => {
        const host = await xmlMergeHost();
        await host.pick("Task_Pack", "current");
        await host.openMerge("Task_Pack");
        const { key, start } = host.openRequest();
        const refused = start.replace("Pack box", "Pack crate");

        host.editor.saveAndClose(key, refused);
        await host.finishing();

        expect(host.session.decisions.handMergeOf("Task_Pack")).toBeUndefined();
        expect(lastOutcomeOf(host.current)).toMatchObject({
            applied: false,
            action: "mergeByHand",
            handMergeRefusal: { kind: "conflictMarkersLeft" },
        });
        await host.openMerge("Task_Pack", true);
        expect(host.openRequest().start).toBe(refused);
    });

    it("starts Edit again from the accepted text once a later text was taken", async () => {
        const host = await xmlMergeHost();
        await host.pick("Task_Pack", "current");
        await host.openMerge("Task_Pack");
        const first = host.openRequest();
        host.editor.saveAndClose(first.key, first.start.replace("Pack box", "Pack crate"));
        await host.finishing();
        await host.openMerge("Task_Pack", true);
        const second = host.openRequest();
        host.editor.saveAndClose(second.key, first.current.replace("Pack parcel", "Pack it"));
        await host.finishing();

        await host.openMerge("Task_Pack", true);

        expect(host.openRequest().start).toContain('name="Pack it"');
    });

    it("refuses a text merged for a side the user picked away while the editor was open", async () => {
        const host = await xmlMergeHost();
        await host.pick("Task_Pack", "current");
        await host.openMerge("Task_Pack");
        const { key, current } = host.openRequest();

        await host.pick("Task_Pack", "incoming");
        host.editor.saveAndClose(key, current.replace("Pack parcel", "Pack it"));
        await host.finishing();

        expect(host.session.decisions.handMergeOf("Task_Pack")).toBeUndefined();
        expect(lastOutcomeOf(host.current)).toMatchObject({
            handMergeRefusal: { kind: "notHandMergeable" },
        });
    });

    it("forgets a refused text once a pick changed the decisions", async () => {
        const host = await xmlMergeHost();
        await host.pick("Task_Pack", "current");
        await host.openMerge("Task_Pack");
        const { key, start } = host.openRequest();
        host.editor.saveAndClose(key, start.replace("Pack box", "Pack crate"));
        await host.finishing();

        await host.pick("Process_1", "current");
        await host.openMerge("Task_Pack", true);

        expect(host.openRequest().start).toBe(start);
    });

    it("keeps a refused text through another element's merge closed without a save, which changes no pick", async () => {
        const host = await xmlMergeHost();
        await host.pick("Task_Pack", "current");
        await host.pick("Process_1", "incoming");
        await host.openMerge("Task_Pack");
        const { key, start } = host.openRequest();
        const refused = start.replace("Pack box", "Pack crate");
        host.editor.saveAndClose(key, refused);
        await host.finishing();

        await host.openMerge("Process_1");
        host.editor.closeByUser(host.editor.openFor("Process_1")!.key);
        await host.finishing();
        await host.openMerge("Task_Pack", true);

        expect(host.openRequest().start).toBe(refused);
    });

    it("shows a merge closed without a save as discarded and changes nothing", async () => {
        const host = await xmlMergeHost();
        await host.pick("Task_Pack", "current");
        await host.openMerge("Task_Pack");

        host.editor.closeByUser(host.openRequest().key);
        await host.finishing();

        expect(host.session.decisions.handMergeOf("Task_Pack")).toBeUndefined();
        expect(lastOutcomeOf(host.incoming)).toMatchObject({
            applied: false,
            action: "mergeByHand",
            discarded: true,
        });
    });

    it("closes its editors when the merge view ends, answers nothing, and tells its listeners", async () => {
        const host = await xmlMergeHost();
        const finished: [string, string | undefined][] = [];
        host.xmlMerge.onFinished((elementId, written) => finished.push([elementId, written]));
        await host.pick("Task_Pack", "current");
        await host.openMerge("Task_Pack");
        const postedBefore = host.current.posted.length;

        host.store.detach(host.current);
        host.store.detach(host.incoming);
        await vi.waitFor(() => expect(finished).toStrictEqual([["Task_Pack", undefined]]));

        expect(host.editor.shownResults()).toStrictEqual({});
        expect(host.current.posted).toHaveLength(postedBefore);
    });

    it("tells its listeners which element finished, once every pane shows the answer", async () => {
        const host = await xmlMergeHost();
        const finished: [string, string | undefined, MergePaneOutcome | undefined][] = [];
        host.xmlMerge.onFinished((elementId, written) =>
            finished.push([elementId, written, lastOutcomeOf(host.current)]),
        );
        await host.pick("Task_Pack", "current");
        await host.openMerge("Task_Pack");

        host.editor.closeByUser(host.openRequest().key);
        await host.finishing();

        expect(finished).toStrictEqual([
            ["Task_Pack", undefined, expect.objectContaining({ discarded: true })],
        ]);
    });

    describe("Merge XML on an element no pick decides yet", () => {
        const pickableOf = (pane: FakeDiffPaneHandle, elementId: string) =>
            lastStatesOf(pane).states.pickable.find(({ id }) => id === elementId);

        it("keeps it from the named side, shows the pick on the panes and opens the merge editor on it", async () => {
            const host = await xmlMergeHost();

            await host.pickThenMerge("Task_Pack", "incoming");

            expect(host.session.decisions.originOf("Task_Pack")).toBe("picked");
            expect(host.session.decisions.sideOf("Task_Pack")).toBe("incoming");
            expect(lastOutcomeOf(host.current)).toMatchObject({
                applied: true,
                action: "pick",
                elementId: "Task_Pack",
            });
            expect(pickableOf(host.current, "Task_Pack")).toMatchObject({
                pick: { keptSide: "incoming" },
                handMerge: "pickedVersion",
            });
            expect(readConflictMarkers(host.openRequest().start).hasMarkers).toBe(true);
        });

        it("keeps it from the asking pane's side when the request names none", async () => {
            const host = await xmlMergeHost();

            await host.pickThenMerge("Task_Pack", undefined, host.incoming);

            expect(host.session.decisions.sideOf("Task_Pack")).toBe("incoming");
            expect(host.editor.openFor("Task_Pack")).toBeDefined();
        });

        it("takes the pick back when the editor closes without a save, so the conflict is open again", async () => {
            const host = await xmlMergeHost();
            await host.pickThenMerge("Task_Pack", "current");

            host.editor.closeByUser(host.openRequest().key);
            await host.finishing();

            expect(host.session.decisions.originOf("Task_Pack")).toBeUndefined();
            for (const pane of [host.current, host.incoming]) {
                expect(lastOutcomeOf(pane)).toMatchObject({
                    applied: false,
                    action: "mergeByHand",
                    elementId: "Task_Pack",
                    discarded: true,
                });
                expect(pickableOf(pane, "Task_Pack")).toStrictEqual({
                    id: "Task_Pack",
                    handMerge: "withPick",
                });
            }
        });

        it("keeps the pick once the saved text is taken", async () => {
            const host = await xmlMergeHost();
            await host.pickThenMerge("Task_Pack", "current");
            const { key, current } = host.openRequest();

            host.editor.saveAndClose(key, current.replace("Pack parcel", "Pack it"));
            await host.finishing();

            expect(host.session.decisions.handMergeOf("Task_Pack")?.side).toBe("current");
            expect(pickableOf(host.current, "Task_Pack")).toMatchObject({
                pick: { keptSide: "current", mergedByHand: true },
            });
        });

        it("keeps the pick through a refused text, and through an Edit again closed without a save", async () => {
            const host = await xmlMergeHost();
            await host.pickThenMerge("Task_Pack", "current");
            const { key, start } = host.openRequest();
            host.editor.saveAndClose(key, start.replace("Pack box", "Pack crate"));
            await host.finishing();
            expect(host.session.decisions.sideOf("Task_Pack")).toBe("current");

            await host.openMerge("Task_Pack", true);
            host.editor.closeByUser(host.openRequest().key);
            await host.finishing();

            expect(host.session.decisions.originOf("Task_Pack")).toBe("picked");
            expect(host.session.decisions.sideOf("Task_Pack")).toBe("current");
        });

        it("leaves a pick the user moved to the other side while the editor was open", async () => {
            const host = await xmlMergeHost();
            await host.pickThenMerge("Task_Pack", "current");
            await host.pick("Task_Pack", "incoming");

            host.editor.closeByUser(host.openRequest().key);
            await host.finishing();

            expect(host.session.decisions.originOf("Task_Pack")).toBe("picked");
            expect(host.session.decisions.sideOf("Task_Pack")).toBe("incoming");
        });

        it("forgets the texts refused before the pick it takes back, as an undo does", async () => {
            const host = await xmlMergeHost();
            await host.pickThenMerge("Task_Pack", "current");
            await host.pick("Process_1", "incoming");
            await host.openMerge("Process_1");
            const process = host.editor.openFor("Process_1")!;
            host.editor.saveAndClose(process.key, process.start.replace("Order B", "Order C"));
            await host.finishing();

            host.editor.closeByUser(host.openRequest().key);
            await host.finishing();
            await host.openMerge("Process_1", true);

            expect(host.editor.openFor("Process_1")?.start).toBe(process.start);
        });

        it("picks nothing on a host without the merge editor", async () => {
            const host = await xmlMergeHost({ available: false });

            await host.pickThenMerge("Task_Pack", "current");

            expect(host.session.decisions.originOf("Task_Pack")).toBeUndefined();
            expect(host.editor.openings).toStrictEqual([]);
            expect(host.notifier.logged("info")).toContain(
                "Merge XML of Task_Pack not opened: the host offers no XML merge editor.",
            );
        });

        it("picks nothing on an element whose base equals a side", async () => {
            const host = await xmlMergeHost();
            const sideBefore = host.session.decisions.sideOf("Task_Check");

            await host.pickThenMerge("Task_Check", "incoming");

            expect(host.session.decisions.originOf("Task_Check")).toBe("automatic");
            expect(host.session.decisions.sideOf("Task_Check")).toBe(sideBefore);
            expect(host.editor.openings).toStrictEqual([]);
            expect(host.notifier.logged("info")).toContain(
                "Merge XML of Task_Check not opened: a pick decides it already, or its base equals a side.",
            );
        });

        it("leaves an element a pick decides already to that pick", async () => {
            const host = await xmlMergeHost();
            await host.pick("Task_Pack", "current");

            await host.pickThenMerge("Task_Pack", "incoming");

            expect(host.session.decisions.sideOf("Task_Pack")).toBe("current");
            expect(host.editor.openings).toStrictEqual([]);
        });

        it("is what a pane's pick that asks for Merge XML does, while a plain pick opens no editor", async () => {
            const host = await xmlMergeHost();

            await host.router.dispatch(
                new PickMergeSideCommand("Process_1", "element", "incoming"),
                host.current,
            );
            expect(host.session.decisions.sideOf("Process_1")).toBe("incoming");
            expect(host.editor.openings).toStrictEqual([]);

            await host.router.dispatch(
                new PickMergeSideCommand("Task_Pack", "element", undefined, { mergesXml: true }),
                host.incoming,
            );

            expect(host.session.decisions.sideOf("Task_Pack")).toBe("incoming");
            expect(host.editor.openings.map(({ elementId }) => elementId)).toStrictEqual([
                "Task_Pack",
            ]);
        });

        it("opens no editor where the pick did not apply, and leaves the answer to the pick's own", async () => {
            const host = await xmlMergeHost();

            await host.xmlMerge.openWithPick(host.diffSession, "Task_Pack", async () => false);

            expect(host.editor.openings).toStrictEqual([]);
            expect(host.notifier.logged("info")).toStrictEqual([]);
        });
    });

    it("opens nothing on a host without the merge editor", async () => {
        const host = await xmlMergeHost({ available: false });
        await host.pick("Task_Pack", "current");

        await host.openMerge("Task_Pack");

        expect(host.editor.openings).toStrictEqual([]);
        expect(host.notifier.logged("info")).toContain(
            "Merge XML of Task_Pack not opened: the host offers no XML merge editor.",
        );
    });
});
