import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
    FakeDiffPaneHandle,
    mergeSessionOf,
    ORDER_MERGE_STAGES,
    ORDER_MERGE_STAGES_AGAIN,
    RecordingMergeSidesView,
} from "../../testing";
import { DiffPaneStore } from "./DiffPaneStore";
import { MergeSession, MergeSessionStore } from "./MergeSessionStore";

const FILE = "file:///repo/order.bpmn";
const URIS = {
    current: "bpmn-merge:/repo/order.current.bpmn?side%3Dcurrent%26opening%3D1",
    incoming: "bpmn-merge:/repo/order.incoming.bpmn?side%3Dincoming%26opening%3D1",
};

const SESSION_FACTS = {
    fileUri: FILE,
    fileName: "order.bpmn",
    title: "order.bpmn (Merge: main ↔ feature)",
    captions: {
        current: { side: "current", role: "branch", ref: "main" },
        incoming: { side: "incoming", role: "upstream", ref: "feature" },
    },
    uris: URIS,
    stages: ORDER_MERGE_STAGES,
} as const;

function createStore() {
    const diffStore = new DiffPaneStore();
    const view = new RecordingMergeSidesView();
    const sessions = new MergeSessionStore(diffStore, view);
    return { diffStore, view, sessions };
}

const NEWER_URIS = {
    current: "bpmn-merge:/repo/order.current.bpmn?side%3Dcurrent%26opening%3D2",
    incoming: "bpmn-merge:/repo/order.incoming.bpmn?side%3Dincoming%26opening%3D2",
};

let SESSION: MergeSession;
let NEWER_SESSION: MergeSession;

beforeAll(async () => {
    SESSION = await mergeSessionOf(SESSION_FACTS);
    NEWER_SESSION = await mergeSessionOf({
        ...SESSION_FACTS,
        uris: NEWER_URIS,
        stages: ORDER_MERGE_STAGES_AGAIN,
    });
});

function openTab(diffStore: DiffPaneStore, uris = URIS) {
    const diffSession = diffStore.registerMerge(uris);
    const current = new FakeDiffPaneHandle(uris.current);
    const incoming = new FakeDiffPaneHandle(uris.incoming);
    diffSession.attachPane(current);
    diffSession.attachPane(incoming);
    return { diffSession, current, incoming };
}

describe("MergeSessionStore", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("finds a session by its working file, by a pane it serves and by its diff", () => {
        const { diffStore, sessions } = createStore();
        const { diffSession } = openTab(diffStore);

        sessions.add(SESSION, diffSession);

        expect(sessions.of(FILE)).toBe(SESSION);
        expect(sessions.servedBy(URIS.incoming)).toBe(SESSION);
        expect(sessions.ofDiffSession(diffSession)).toBe(SESSION);
        expect(
            sessions.servedBy("bpmn-merge:/repo/order.current.bpmn?opening%3D2"),
        ).toBeUndefined();
    });

    it("forgets the session once every pane closed and stops serving its sides", () => {
        const { diffStore, view, sessions } = createStore();
        const { diffSession, current, incoming } = openTab(diffStore);
        sessions.add(SESSION, diffSession);

        diffStore.detach(current);
        diffStore.detach(incoming);

        expect(sessions.of(FILE)).toBeUndefined();
        expect(view.released).toStrictEqual([URIS]);
    });

    it("keeps the session while a second tab of it stays open", () => {
        const { diffStore, view, sessions } = createStore();
        const first = openTab(diffStore);
        sessions.add(SESSION, first.diffSession);
        const second = openTab(diffStore);
        sessions.join(SESSION, second.diffSession);

        diffStore.detach(first.current);
        diffStore.detach(first.incoming);

        expect(sessions.of(FILE)).toBe(SESSION);
        expect(sessions.diffSessionsOf(SESSION)).toStrictEqual([second.diffSession]);
        expect(view.released).toStrictEqual([]);
    });

    it("finds the newer view of a file and keeps the older one served until its tab closes", () => {
        const { diffStore, view, sessions } = createStore();
        const older = openTab(diffStore);
        sessions.add(SESSION, older.diffSession);
        const newer = openTab(diffStore, NEWER_URIS);
        sessions.add(NEWER_SESSION, newer.diffSession);

        expect(sessions.of(FILE)).toBe(NEWER_SESSION);
        expect(sessions.servedBy(URIS.current)).toBe(SESSION);
        diffStore.detach(older.current);
        diffStore.detach(older.incoming);

        expect(view.released).toStrictEqual([URIS]);
        expect(sessions.of(FILE)).toBe(NEWER_SESSION);
    });

    it("forgets a session whose panes never opened", () => {
        const { diffStore, view, sessions } = createStore();
        sessions.add(SESSION, diffStore.registerMerge(URIS));

        vi.advanceTimersByTime(30_000);

        expect(sessions.of(FILE)).toBeUndefined();
        expect(view.released).toStrictEqual([URIS]);
    });

    it("ignores a closing diff that is no merge view", () => {
        const { diffStore, sessions } = createStore();
        const { diffSession } = openTab(diffStore);
        sessions.add(SESSION, diffSession);
        const compare = diffStore.registerCompareFiles("file:///a.bpmn", "file:///b.bpmn");
        const pane = new FakeDiffPaneHandle("file:///a.bpmn");
        compare.attachPane(pane);

        diffStore.detach(pane);

        expect(sessions.of(FILE)).toBe(SESSION);
    });
});
