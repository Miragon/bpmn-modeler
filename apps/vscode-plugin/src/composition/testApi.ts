import { DiffPaneStore, EditorSessionStore, MergeSessionStore } from "@miragon/bpmn-modeler-core";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

import { ElementXmlMergeProbe } from "./elementXmlMergeFeature";

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
    readonly mergeXml: ElementXmlMergeProbe;
}): TestApi {
    const { editorStore, diffStore, dmnDiffStore, mergeSessions, buildMerge, mergeXml } = handles;
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
        mergeXml,
    };
}
