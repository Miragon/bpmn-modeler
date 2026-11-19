import {
    DiffPaneStore,
    EditorSessionStore,
    ElementXmlMergeService,
    MergeSessionStore,
} from "@miragon/bpmn-modeler-core";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

/** What the e2e tests drive of the element XML merge, through the service as a pane would. */
export interface ElementXmlMergeProbe {
    /**
     * Opens the merge editor on a picked element of the newest merge view of
     * `fileUri`; `finished` resolves with the text the editor reported once
     * the core has answered the element's next finished merge.
     */
    open(
        fileUri: string,
        elementId: string,
    ): { opened: Promise<void>; finished: Promise<string | undefined> };
    /** The text an element merged by hand reopens with, if it is merged by hand. */
    handMergeOf(fileUri: string, elementId: string): string | undefined;
}

/** Narrow API surface returned by `activate()` for e2e tests only. */
export interface TestApi {
    modeler: {
        /** Whether the editable modeler of `uri` has opened its editor session. */
        hasEditor(uri: string): boolean;
    };
    diff: {
        sessionFor(uri: string): { origin: string; paneCount: number } | undefined;
        /** Diff panes that render `uri`, attached or waiting for a partner; 0 for the editable modeler. */
        paneCountFor(uri: string): number;
    };
    merge: {
        /** The merge view of a working file: its diff origin, open panes, tabs and captions. */
        sessionFor(
            fileUri: string,
        ): { origin: string; paneCount: number; tabCount: number; captions: unknown } | undefined;
        /** Builds the merge view's result into the working file, as its Build button does. */
        build(fileUri: string): Promise<void>;
        /** Keeps an element from `side` in the merge view's decisions, without telling its panes; whether it applied. */
        pick(fileUri: string, elementId: string, side: MergeSide): boolean;
    };
    mergeXml: ElementXmlMergeProbe;
}

/** What the e2e tests read and drive, from the stores and handles the features returned. */
export function createTestApi(handles: {
    readonly editorStore: Pick<EditorSessionStore, "hasEditor">;
    readonly diffStore: DiffPaneStore;
    readonly dmnDiffStore: DiffPaneStore;
    readonly mergeSessions: MergeSessionStore;
    readonly buildMerge: (fileUri: string) => Promise<void>;
    readonly elementXmlMerge: Pick<ElementXmlMergeService, "open" | "onFinished">;
}): TestApi {
    const { editorStore, diffStore, dmnDiffStore, mergeSessions, buildMerge } = handles;
    return {
        modeler: {
            hasEditor: (uri: string) => editorStore.hasEditor(uri),
        },
        diff: {
            sessionFor(uri: string) {
                const session = diffStore.findByUri(uri) ?? dmnDiffStore.findByUri(uri);
                if (!session) {
                    return undefined;
                }
                return { origin: session.origin, paneCount: session.attachedPanes().length };
            },
            paneCountFor(uri: string) {
                return diffStore.paneCountFor(uri) + dmnDiffStore.paneCountFor(uri);
            },
        },
        merge: {
            sessionFor(fileUri: string) {
                const session = mergeSessions.of(fileUri);
                if (!session) {
                    return undefined;
                }
                const tabs = mergeSessions.diffSessionsOf(session);
                return {
                    origin: tabs[0]?.origin,
                    paneCount: tabs.reduce((count, tab) => count + tab.attachedPanes().length, 0),
                    tabCount: tabs.length,
                    captions: session.captions,
                };
            },
            build: buildMerge,
            pick: (fileUri, elementId, side) =>
                mergeSessions.of(fileUri)?.decisions.pick(elementId, side).applied ?? false,
        },
        mergeXml: elementXmlMergeProbe(mergeSessions, handles.elementXmlMerge),
    };
}

function elementXmlMergeProbe(
    sessions: MergeSessionStore,
    merges: Pick<ElementXmlMergeService, "open" | "onFinished">,
): ElementXmlMergeProbe {
    const waiting = new Map<string, ProbeWait>();
    merges.onFinished((elementId, written) => {
        waiting.get(elementId)?.answer(written);
        waiting.delete(elementId);
    });
    return {
        open(fileUri, elementId) {
            const session = sessions.of(fileUri);
            const tab = session && sessions.diffSessionsOf(session)[0];
            if (!tab) {
                const missing = Promise.reject(new Error(`No merge view of ${fileUri} is open.`));
                return { opened: missing, finished: missing.then(() => undefined) };
            }
            // A second open of a merge that is open brings it to the front and finishes with it.
            const wait = waiting.get(elementId) ?? probeWait();
            waiting.set(elementId, wait);
            return { opened: merges.open(tab, elementId), finished: wait.finished };
        },
        handMergeOf: (fileUri, elementId) =>
            sessions.of(fileUri)?.decisions.handMergeOf(elementId)?.shownText,
    };
}

interface ProbeWait {
    readonly finished: Promise<string | undefined>;
    readonly answer: (written: string | undefined) => void;
}

function probeWait(): ProbeWait {
    let answer: ProbeWait["answer"] = () => undefined;
    const finished = new Promise<string | undefined>((done) => {
        answer = done;
    });
    return { finished, answer };
}
