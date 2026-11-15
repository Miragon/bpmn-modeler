import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDiffPaneHandle, RecordingMergeSidesView } from "../../testing";
import { DiffPaneStore } from "./DiffPaneStore";
import { MergeSession, MergeSessionStore } from "./MergeSessionStore";

const FILE = "file:///repo/order.bpmn";
const URIS = {
    current: "bpmn-merge:/repo/order.current.bpmn?side%3Dcurrent%26opening%3D1",
    incoming: "bpmn-merge:/repo/order.incoming.bpmn?side%3Dincoming%26opening%3D1",
};

const SESSION: MergeSession = {
    fileUri: FILE,
    fileName: "order.bpmn",
    title: "order.bpmn (Merge: main ↔ feature)",
    captions: {
        current: { side: "current", role: "branch", ref: "main" },
        incoming: { side: "incoming", role: "upstream", ref: "feature" },
    },
    uris: URIS,
    stages: { current: "<current/>", incoming: "<incoming/>" },
};

function createStore() {
    const diffStore = new DiffPaneStore();
    const view = new RecordingMergeSidesView();
    const sessions = new MergeSessionStore(diffStore, view);
    return { diffStore, view, sessions };
}

function openTab(diffStore: DiffPaneStore) {
    const diffSession = diffStore.registerMerge(URIS);
    const current = new FakeDiffPaneHandle(URIS.current);
    const incoming = new FakeDiffPaneHandle(URIS.incoming);
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
        sessions.join(FILE, second.diffSession);

        diffStore.detach(first.current);
        diffStore.detach(first.incoming);

        expect(sessions.of(FILE)).toBe(SESSION);
        expect(sessions.diffSessionsOf(FILE)).toStrictEqual([second.diffSession]);
        expect(view.released).toStrictEqual([]);
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
