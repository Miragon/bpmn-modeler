import { describe, expect, it } from "vitest";

import {
    createTestHost,
    FakeConflictVersionsSource,
    FakeDiffPaneHandle,
    RecordingMergeSidesView,
    StagedConflict,
} from "../../testing";
import { DiffPaneStore } from "./DiffPaneStore";
import { MergeSessionStore } from "./MergeSessionStore";
import { MergeViewOpener } from "./MergeViewOpener";

const ROOT = "file:///repo";
const FILE = `${ROOT}/order.bpmn`;
const HEAD = { hash: "1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", subject: "Check the order" };
const OTHER = { hash: "9f8e7d6bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", subject: "Rename the check" };

const MERGE_CONFLICT: StagedConflict = {
    fileUri: FILE,
    stages: { base: "<base/>", current: "<current/>", incoming: "<incoming/>" },
    refs: { headName: "main", head: HEAD, mergeHead: OTHER },
    workingText: "<<<<<<< HEAD\n<current/>\n=======\n<incoming/>\n>>>>>>> feature\n",
};

function createOpener(...conflicts: StagedConflict[]) {
    const { notifier } = createTestHost();
    const source = new FakeConflictVersionsSource();
    conflicts.forEach((conflict) => source.conflict(ROOT, conflict));
    const view = new RecordingMergeSidesView();
    const diffStore = new DiffPaneStore();
    const sessions = new MergeSessionStore(diffStore, view);
    const opener = new MergeViewOpener(source, view, diffStore, sessions, notifier);
    return { opener, source, view, diffStore, sessions, notifier };
}

function tabsOf(sessions: MergeSessionStore) {
    const session = sessions.of(FILE);
    return session ? sessions.diffSessionsOf(session) : [];
}

/** Plays VS Code resolving both sides of the diff `vscode.diff` opened. */
function resolveBothPanes(opener: MergeViewOpener, uris: { current: string; incoming: string }) {
    const current = new FakeDiffPaneHandle(uris.current);
    const incoming = new FakeDiffPaneHandle(uris.incoming);
    return {
        current,
        incoming,
        outcomes: [opener.attachPane(current), opener.attachPane(incoming)],
    };
}

describe("MergeViewOpener", () => {
    it("opens current and incoming as a merge session with Git's captions", async () => {
        const { opener, view, diffStore, sessions } = createOpener(MERGE_CONFLICT);

        await opener.open(FILE);

        const [{ uris }] = view.served;
        expect(view.opened).toStrictEqual([
            { left: uris.current, right: uris.incoming, title: "order.bpmn (Merge: main ↔ feature)" },
        ]);
        expect(view.textOf(uris.current)).toBe("<current/>");
        expect(view.textOf(uris.incoming)).toBe("<incoming/>");
        expect(diffStore.awaitingPaneFor(uris.current)?.origin).toBe("merge");
        expect(diffStore.awaitingPaneFor(uris.current)?.sideFor(uris.incoming)).toBe("after");
        expect(sessions.of(FILE)?.captions).toStrictEqual({
            current: {
                side: "current",
                role: "branch",
                ref: "main",
                shortHash: "1111111",
                subject: "Check the order",
            },
            incoming: {
                side: "incoming",
                role: "upstream",
                ref: "feature",
                shortHash: "9f8e7d6",
                subject: "Rename the check",
            },
        });
    });

    it("tells the user's own commit apart during a rebase and keeps current on the left", async () => {
        const { opener, view, sessions } = createOpener({
            ...MERGE_CONFLICT,
            refs: { head: HEAD, rebaseHead: OTHER, rebaseInProgress: true },
        });

        await opener.open(FILE);

        expect(view.opened[0].title).toBe("order.bpmn (Merge: 1111111 ↔ 9f8e7d6)");
        expect(sessions.of(FILE)?.captions.incoming.role).toBe("yourCommit");
        expect(view.opened[0].left).toBe(view.served[0].uris.current);
    });

    it("opens without an ancestor when both sides added the file", async () => {
        const { opener, view, sessions } = createOpener({
            ...MERGE_CONFLICT,
            stages: { current: "<current/>", incoming: "<incoming/>" },
        });

        await opener.open(FILE);

        expect(view.opened).toHaveLength(1);
        expect(sessions.of(FILE)?.stages).toStrictEqual({
            current: "<current/>",
            incoming: "<incoming/>",
        });
    });

    it("names the panes after their side", async () => {
        const { opener, view } = createOpener(MERGE_CONFLICT);

        await opener.open(FILE);

        expect(view.served).toMatchObject([
            {
                fileUri: FILE,
                basenames: { current: "order.current.bpmn", incoming: "order.incoming.bpmn" },
            },
        ]);
    });

    it("refuses a file one side deleted and names the side that kept it", async () => {
        const { opener, view, notifier } = createOpener({
            ...MERGE_CONFLICT,
            stages: { base: "<base/>", current: "<current/>" },
        });

        await opener.open(FILE);

        expect(notifier.infos).toStrictEqual([
            "order.bpmn was deleted on the incoming side and changed on the current side. Keep or delete it in Source Control.",
        ]);
        expect(view.served).toStrictEqual([]);
        expect(view.opened).toStrictEqual([]);
    });

    it("explains a Merge Changes row that is not a BPMN file, without asking Git", async () => {
        const notes = `${ROOT}/notes.txt`;
        const { opener, view, source, notifier } = createOpener({
            ...MERGE_CONFLICT,
            fileUri: notes,
        });

        await opener.open(notes);

        expect(notifier.infos).toStrictEqual([
            "notes.txt is not a BPMN file. The BPMN merge view opens conflicted .bpmn files only.",
        ]);
        expect(source.reads.get(notes)).toBeUndefined();
        expect(view.opened).toStrictEqual([]);
    });

    it("explains a file that is no longer conflicted", async () => {
        const { opener, view, notifier } = createOpener();

        await opener.open(FILE);

        expect(notifier.infos).toStrictEqual(["order.bpmn has no merge conflict to resolve."]);
        expect(view.opened).toStrictEqual([]);
    });

    it("asks for a file when the command got none", async () => {
        const { opener, notifier } = createOpener();

        await opener.open(undefined);

        expect(notifier.infos).toStrictEqual([
            "Open a conflicted BPMN file, or select one in Source Control, to resolve it in the BPMN merge view.",
        ]);
    });

    it("focuses the open merge view by opening its own pane URIs again, not a second session", async () => {
        const { opener, view, sessions } = createOpener(MERGE_CONFLICT);
        await opener.open(FILE);
        resolveBothPanes(opener, view.served[0].uris);

        await opener.open(FILE);

        expect(view.served).toHaveLength(1);
        expect(view.opened.map(({ left, right }) => [left, right])).toStrictEqual([
            [view.served[0].uris.current, view.served[0].uris.incoming],
            [view.served[0].uris.current, view.served[0].uris.incoming],
        ]);
        expect(tabsOf(sessions)).toHaveLength(1);
    });

    it("opens the new conflict when the file conflicted again while its old view is open", async () => {
        const { opener, view, source, sessions } = createOpener(MERGE_CONFLICT);
        await opener.open(FILE);
        resolveBothPanes(opener, view.served[0].uris);
        source.resolve(ROOT, FILE);
        source.conflict(ROOT, {
            ...MERGE_CONFLICT,
            stages: { base: "<base2/>", current: "<current2/>", incoming: "<incoming2/>" },
        });

        await opener.open(FILE);

        expect(view.served).toHaveLength(2);
        expect(view.opened[1].right).toBe(view.served[1].uris.incoming);
        expect(view.textOf(view.served[1].uris.incoming)).toBe("<incoming2/>");
        expect(sessions.of(FILE)?.stages.incoming).toBe("<incoming2/>");
    });

    it("explains a file whose conflict was resolved while its old view is open", async () => {
        const { opener, view, source, notifier } = createOpener(MERGE_CONFLICT);
        await opener.open(FILE);
        resolveBothPanes(opener, view.served[0].uris);
        source.resolve(ROOT, FILE);

        await opener.open(FILE);

        expect(notifier.infos).toStrictEqual(["order.bpmn has no merge conflict to resolve."]);
        expect(view.opened).toHaveLength(1);
    });

    it("attaches both panes VS Code resolves to the session registered for them", async () => {
        const { opener, view, diffStore } = createOpener(MERGE_CONFLICT);
        await opener.open(FILE);

        const { current, incoming, outcomes } = resolveBothPanes(opener, view.served[0].uris);

        expect(outcomes).toStrictEqual(["joined", "joined"]);
        expect(diffStore.sessionOf(current)?.attachedPanes()).toStrictEqual([current, incoming]);
    });

    it("gives a second tab of a live merge view its own session", async () => {
        const { opener, view, diffStore, sessions } = createOpener(MERGE_CONFLICT);
        await opener.open(FILE);
        const { uris } = view.served[0];
        const first = resolveBothPanes(opener, uris);

        const second = resolveBothPanes(opener, uris);

        expect(second.outcomes).toStrictEqual(["joined", "joined"]);
        expect(tabsOf(sessions)).toHaveLength(2);
        expect(diffStore.sessionOf(second.current)).not.toBe(diffStore.sessionOf(first.current));
        expect(diffStore.sessionOf(second.current)?.attachedPanes()).toStrictEqual([
            second.current,
            second.incoming,
        ]);
    });

    it("keeps a pane attached once when its handle resolves twice", async () => {
        const { opener, view, sessions } = createOpener(MERGE_CONFLICT);
        await opener.open(FILE);
        const pane = new FakeDiffPaneHandle(view.served[0].uris.current);
        opener.attachPane(pane);

        expect(opener.attachPane(pane)).toBe("joined");
        expect(tabsOf(sessions)).toHaveLength(1);
    });

    it("ends a pane no session serves, also on its second resolve", () => {
        const { opener, diffStore } = createOpener(MERGE_CONFLICT);
        const restored = new FakeDiffPaneHandle(
            "bpmn-merge:/repo/order.current.bpmn?side%3Dcurrent%26opening%3Dearlier-run",
        );

        expect(opener.attachPane(restored)).toBe("ended");
        expect(opener.attachPane(restored)).toBe("ended");
        expect(diffStore.findByUri(restored.uri)).toBeUndefined();
        expect(diffStore.paneCountFor(restored.uri)).toBe(0);
    });

    it("ends the panes of a merge view whose tab was closed", async () => {
        const { opener, view, diffStore } = createOpener(MERGE_CONFLICT);
        await opener.open(FILE);
        const { uris } = view.served[0];
        const { current, incoming } = resolveBothPanes(opener, uris);
        diffStore.detach(current);
        diffStore.detach(incoming);

        expect(opener.attachPane(new FakeDiffPaneHandle(uris.current))).toBe("ended");
        expect(view.released).toStrictEqual([uris]);
    });

    it("shows why the host could not open the merge view", async () => {
        const { opener, view, notifier } = createOpener(MERGE_CONFLICT);
        view.open = () => Promise.reject(new Error("no editor for the scheme"));

        await opener.open(FILE);

        expect(notifier.errors).toStrictEqual([
            "Failed to open the BPMN merge view: no editor for the scheme",
        ]);
    });

    it("shows why Git could not be read", async () => {
        const { opener, source, view, notifier } = createOpener(MERGE_CONFLICT);
        source.readConflict = () => Promise.reject(new Error("git status failed"));

        await opener.open(FILE);

        expect(notifier.errors).toStrictEqual([
            "Failed to open the BPMN merge view: git status failed",
        ]);
        expect(view.opened).toStrictEqual([]);
    });

    it("writes nothing: the working file and the index stay as Git left them", async () => {
        const { opener, source, notifier } = createOpener(MERGE_CONFLICT);
        const before = await source.readConflict(FILE);

        await opener.open(FILE);

        expect(await source.readConflict(FILE)).toStrictEqual(before);
        expect(notifier.openedDocuments).toStrictEqual([]);
    });
});
