import { ExtensionContext, workspace } from "vscode";

import {
    ElementXmlMergeService,
    MergeDecisionService,
    MergeSessionStore,
} from "@miragon/bpmn-modeler-core";
import { ElementXmlMergeController } from "../diff/adapter/in/ElementXmlMergeController";
import {
    MERGE_RESULT_SCHEME,
    MERGE_XML_SCHEME,
    VsCodeElementXmlMergeEditor,
} from "../diff/adapter/out/VsCodeElementXmlMergeEditor";
import { VsCodeMergeEditorAvailability } from "../diff/adapter/out/VsCodeMergeEditorAvailability";
import { InMemoryFileSystemProvider } from "../shared/adapter/in/InMemoryFileSystemProvider";
import { SharedDeps } from "./sharedDeps";

/** What the e2e tests drive of the element XML merge, through the service as a pane would. */
export interface ElementXmlMergeProbe {
    /**
     * Opens the merge editor on a picked element of the newest merge view of
     * `fileUri`; `finished` resolves with the text the editor reported once
     * the core has answered the next finished merge.
     */
    open(
        fileUri: string,
        elementId: string,
    ): { opened: Promise<void>; finished: Promise<string | undefined> };
    /** The text an element merged by hand reopens with, if it is merged by hand. */
    handMergeOf(fileUri: string, elementId: string): string | undefined;
}

/**
 * The element XML merge editor: its files under `bpmn-merge-xml:` and
 * `bpmn-merge-result:`, VS Code's merge editor over them, its title button,
 * whether the host runs it, and the core service the merge panes reach it
 * through. `finishing` hands a finished merge to the diff service, which
 * passes the panes' offers along.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    merge: { readonly sessions: MergeSessionStore; readonly decisions: MergeDecisionService },
    finishing: (key: string, written: string | undefined) => Promise<void>,
): { service: ElementXmlMergeService; probe: ElementXmlMergeProbe } {
    const inputs = new InMemoryFileSystemProvider({ readOnly: true });
    const results = new InMemoryFileSystemProvider({ editorMayCreateFiles: false });
    const waitingProbes: WaitingProbe[] = [];
    const editor = new VsCodeElementXmlMergeEditor(inputs, results, (key, written) => {
        const answered = finishing(key, written).then(() => written);
        answered.catch((error: unknown) => deps.notifier.logError(error as Error));
        waitingProbes.shift()?.answer(answered);
    });
    editor.register(context);
    new ElementXmlMergeController().register(context);
    context.subscriptions.push(
        inputs,
        results,
        workspace.registerFileSystemProvider(MERGE_XML_SCHEME, inputs, {
            isCaseSensitive: true,
            isReadonly: true,
        }),
        workspace.registerFileSystemProvider(MERGE_RESULT_SCHEME, results, {
            isCaseSensitive: true,
        }),
    );
    const service = new ElementXmlMergeService(
        merge.sessions,
        merge.decisions,
        editor,
        new VsCodeMergeEditorAvailability(),
        deps.notifier,
    );
    return { service, probe: probeOf(merge.sessions, service, waitingProbes) };
}

/** A probe's open waiting for its merge to finish; the e2e finishes one merge at a time. */
interface WaitingProbe {
    readonly elementId: string;
    readonly finished: Promise<string | undefined>;
    readonly answer: (answered: Promise<string | undefined>) => void;
}

function probeOf(
    sessions: MergeSessionStore,
    service: ElementXmlMergeService,
    waitingProbes: WaitingProbe[],
): ElementXmlMergeProbe {
    return {
        open(fileUri, elementId) {
            const session = sessions.of(fileUri);
            const tab = session && sessions.diffSessionsOf(session)[0];
            if (!tab) {
                const missing = Promise.reject(new Error(`No merge view of ${fileUri} is open.`));
                return { opened: missing, finished: missing.then(() => undefined) };
            }
            // A second open of a merge that is open brings it to the front and finishes with it.
            const waiting = waitingProbes.find((probe) => probe.elementId === elementId);
            if (waiting)
                return { opened: service.open(tab, elementId), finished: waiting.finished };
            let answer: WaitingProbe["answer"] = () => undefined;
            const finished = new Promise<string | undefined>((done) => {
                answer = (answered) => void answered.then(done, () => done(undefined));
            });
            waitingProbes.push({ elementId, finished, answer });
            return { opened: service.open(tab, elementId), finished };
        },
        handMergeOf: (fileUri, elementId) =>
            sessions.of(fileUri)?.decisions.handMergeOf(elementId)?.shownText,
    };
}
