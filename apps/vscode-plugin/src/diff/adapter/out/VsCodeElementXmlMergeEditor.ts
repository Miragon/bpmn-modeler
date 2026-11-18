import {
    commands,
    ExtensionContext,
    Tab,
    TextDocumentSaveReason,
    Uri,
    window,
    workspace,
} from "vscode";

import { EditorWrittenTextFiles, ServedTextFiles } from "../../../shared/port/ServedTextFiles";

import { elementXmlUris } from "./elementXmlUris";

export const MERGE_XML_SCHEME = "bpmn-merge-xml";
export const MERGE_RESULT_SCHEME = "bpmn-merge-result";
const OPEN_MERGE_EDITOR = "_open.mergeEditor";

export interface ElementXmlMergeRequest {
    readonly key: string;
    readonly elementId: string;
    readonly labels: { readonly current: string; readonly incoming: string };
    readonly base: string;
    readonly current: string;
    readonly incoming: string;
    /** The result's text when the editor opens; a line starting with `<<<<<<<` makes the editor merge it. */
    readonly start: string;
}

interface OpenMerge {
    readonly base: Uri;
    readonly current: Uri;
    readonly incoming: Uri;
    readonly result: Uri;
    closingFromCode: boolean;
    manualSaveUnderway: boolean;
    answer: string | undefined;
}

/**
 * Opens one element's XML in VS Code's merge editor: base and both sides
 * read-only under `bpmn-merge-xml:`, the result writable under
 * `bpmn-merge-result:`. The merge finishes when its last tab closes, with the
 * text the user's last manual save wrote, or none: an auto-save is no answer,
 * and a merge closed from code finishes with none.
 */
export class VsCodeElementXmlMergeEditor {
    private readonly mergesByKey = new Map<string, OpenMerge>();

    /** @param onFinished Told the key of a finished merge and the text the user saved, if any. */
    constructor(
        private readonly inputs: ServedTextFiles<Uri>,
        private readonly results: EditorWrittenTextFiles<Uri>,
        private readonly onFinished: (key: string, written: string | undefined) => void,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            window.tabGroups.onDidChangeTabs((event) => this.finishClosed(event.closed)),
            workspace.onWillSaveTextDocument(({ document, reason }) => {
                const merge = this.mergeOfResult(document.uri);
                if (merge) merge.manualSaveUnderway = reason === TextDocumentSaveReason.Manual;
            }),
            workspace.onDidSaveTextDocument((document) => {
                const merge = this.mergeOfResult(document.uri);
                if (!merge?.manualSaveUnderway) return;
                merge.answer = this.results.lastEditorWriteOf(merge.result);
                merge.manualSaveUnderway = false;
            }),
        );
    }

    async open(request: ElementXmlMergeRequest): Promise<void> {
        if (this.mergesByKey.has(request.key)) {
            throw new Error(`The element XML merge ${request.key} is already open.`);
        }
        const merge = this.serve(request);
        try {
            await commands.executeCommand(OPEN_MERGE_EDITOR, {
                base: merge.base,
                input1: { uri: merge.current, title: request.labels.current },
                input2: { uri: merge.incoming, title: request.labels.incoming },
                output: merge.result,
            });
        } catch (error) {
            this.finish(request.key, merge, undefined);
            throw error;
        }
    }

    async close(key: string): Promise<void> {
        const merge = this.mergesByKey.get(key);
        if (!merge) return;
        // The command returns before the editor shows, so only here is a merge without a tab known to have none.
        if (tabsShowing(merge.result).length === 0) {
            this.finish(key, merge, undefined);
            return;
        }
        merge.closingFromCode = true;
        // The result is dirty from the start, and closing a dirty result asks the user to save it.
        const result = workspace.textDocuments.find(
            (document) => document.uri.toString() === merge.result.toString(),
        );
        if (result) await result.save();
        const tabs = tabsShowing(merge.result);
        if (tabs.length > 0) await window.tabGroups.close(tabs, true);
    }

    private serve(request: ElementXmlMergeRequest): OpenMerge {
        const uriOf = elementXmlUris(request.elementId);
        const merge: OpenMerge = {
            base: uriOf(MERGE_XML_SCHEME, "base"),
            current: uriOf(MERGE_XML_SCHEME, "current"),
            incoming: uriOf(MERGE_XML_SCHEME, "incoming"),
            result: uriOf(MERGE_RESULT_SCHEME),
            closingFromCode: false,
            manualSaveUnderway: false,
            answer: undefined,
        };
        this.inputs.setContent(merge.base, request.base);
        this.inputs.setContent(merge.current, request.current);
        this.inputs.setContent(merge.incoming, request.incoming);
        this.results.setContent(merge.result, request.start);
        this.mergesByKey.set(request.key, merge);
        return merge;
    }

    private mergeOfResult(uri: Uri): OpenMerge | undefined {
        return [...this.mergesByKey.values()].find(
            (merge) => merge.result.toString() === uri.toString(),
        );
    }

    private finishClosed(closed: readonly Tab[]): void {
        const closedResults = new Set(closed.map(mergeResultOf).map((uri) => uri?.toString()));
        for (const [key, merge] of this.mergesByKey) {
            if (!closedResults.has(merge.result.toString())) continue;
            if (tabsShowing(merge.result).length > 0) continue;
            this.finish(key, merge, merge.closingFromCode ? undefined : merge.answer);
        }
    }

    private finish(key: string, merge: OpenMerge, written: string | undefined): void {
        this.mergesByKey.delete(key);
        [merge.base, merge.current, merge.incoming].forEach((uri) => this.inputs.deleteFile(uri));
        this.results.deleteFile(merge.result);
        this.onFinished(key, written);
    }
}

// `TabInputTextMerge` is proposed API, so a merge tab is told apart by the shape of its input.
function mergeResultOf(tab: Tab): Uri | undefined {
    const result = (tab.input as { result?: unknown } | undefined)?.result;
    return result instanceof Uri ? result : undefined;
}

function tabsShowing(result: Uri): Tab[] {
    return window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter((tab) => mergeResultOf(tab)?.toString() === result.toString());
}
