import { describe, expect, it } from "vitest";

import type { ApplyMergeStatesQuery, MergePaneOutcome } from "@miragon/bpmn-modeler-shared";
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
    let diffService: BpmnDiffService | undefined = undefined;
    const editor = new RecordingElementXmlMergeEditor((key, written) => {
        finishing = diffService?.finishElementXmlMerge(key, written) ?? Promise.resolve();
    });
    const xmlMerge = new ElementXmlMergeService(
        sessions,
        decisions,
        editor,
        { ready: Promise.resolve(available) },
        notifier,
    );
    diffService = new BpmnDiffService(
        notifier,
        settings,
        store,
        undefined,
        decisions,
        undefined,
        xmlMerge,
    );
    const service = diffService;

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
    const openRequest = () => {
        const request = editor.openFor("Task_Pack");
        if (!request) throw new Error("no merge of Task_Pack is open");
        return request;
    };
    return {
        store,
        session,
        editor,
        current,
        incoming,
        secondTab,
        pick,
        openMerge,
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
            expect.objectContaining({ id: "Task_Pack", mergedByHand: true }),
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

    it("closes its editors when the merge view ends, and answers nothing", async () => {
        const host = await xmlMergeHost();
        await host.pick("Task_Pack", "current");
        await host.openMerge("Task_Pack");
        const postedBefore = host.current.posted.length;

        host.store.detach(host.current);
        host.store.detach(host.incoming);
        await host.finishing();

        expect(host.editor.shownResults()).toStrictEqual({});
        expect(host.current.posted).toHaveLength(postedBefore);
    });

    it("offers the merge editor to the panes once the host has it", async () => {
        const offered = await xmlMergeHost();
        const notOffered = await xmlMergeHost({ available: false });

        expect(lastStatesOf(offered.current).offers).toStrictEqual({
            elementXmlChanges: false,
            elementXmlMerge: true,
        });
        expect(lastStatesOf(notOffered.current).offers.elementXmlMerge).toBe(false);
    });

    it("opens nothing on a host without the merge editor", async () => {
        const host = await xmlMergeHost({ available: false });
        await host.pick("Task_Pack", "current");

        await host.openMerge("Task_Pack");

        expect(host.editor.openings).toStrictEqual([]);
    });
});
