import { randomUUID } from "node:crypto";

import { commands, Disposable, Tab, Uri, window, workspace } from "vscode";

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

/** The files the adapter serves, as the host sets them. */
export interface ServedTextFiles {
    setContent(uri: Uri, content: string): void;
    deleteFile(uri: Uri): void;
}

/** The result's files, which also know what the editor wrote. */
export interface EditorWrittenTextFiles extends ServedTextFiles {
    lastEditorWriteOf(uri: Uri): string | undefined;
}

interface ServedMerge {
    readonly base: Uri;
    readonly current: Uri;
    readonly incoming: Uri;
    readonly result: Uri;
}

/**
 * Opens one element's XML in VS Code's merge editor: base and both sides
 * read-only under `bpmn-merge-xml:`, the result writable under
 * `bpmn-merge-result:`. The merge finishes when its tab closes, with the last
 * text the editor wrote, or none; a merge closed from code finishes with none.
 */
export class VsCodeElementXmlMergeEditor {
    private readonly servedByKey = new Map<string, ServedMerge>();
    private readonly closingKeys = new Set<string>();

    /** @param onFinished Told the key of a merge whose tab closed and the text the editor last wrote. */
    constructor(
        private readonly inputs: ServedTextFiles,
        private readonly results: EditorWrittenTextFiles,
        private readonly onFinished: (key: string, written: string | undefined) => void,
    ) {}

    register(): Disposable {
        return window.tabGroups.onDidChangeTabs((event) => this.finishClosed(event.closed));
    }

    async open(request: ElementXmlMergeRequest): Promise<void> {
        const served = this.serve(request);
        await commands.executeCommand(OPEN_MERGE_EDITOR, {
            base: served.base,
            input1: { uri: served.current, title: request.labels.current },
            input2: { uri: served.incoming, title: request.labels.incoming },
            output: served.result,
        });
    }

    async close(key: string): Promise<void> {
        const served = this.servedByKey.get(key);
        if (!served) return;
        this.closingKeys.add(key);
        // The result is dirty from the start, and closing a dirty result asks the user to save it.
        const result = workspace.textDocuments.find(
            (document) => document.uri.toString() === served.result.toString(),
        );
        if (result) await result.save();
        const tabs = tabsShowing(served.result);
        if (tabs.length > 0) await window.tabGroups.close(tabs, true);
    }

    private serve(request: ElementXmlMergeRequest): ServedMerge {
        const authority = randomUUID();
        const uriOf = (scheme: string, side: string) =>
            Uri.from({ scheme, authority, path: `/${request.elementId}.${side}.xml` });
        const served = {
            base: uriOf(MERGE_XML_SCHEME, "base"),
            current: uriOf(MERGE_XML_SCHEME, "current"),
            incoming: uriOf(MERGE_XML_SCHEME, "incoming"),
            result: Uri.from({
                scheme: MERGE_RESULT_SCHEME,
                authority,
                path: `/${request.elementId}.xml`,
            }),
        };
        this.inputs.setContent(served.base, request.base);
        this.inputs.setContent(served.current, request.current);
        this.inputs.setContent(served.incoming, request.incoming);
        this.results.setContent(served.result, request.start);
        this.servedByKey.set(request.key, served);
        return served;
    }

    private finishClosed(closed: readonly Tab[]): void {
        const closedResults = new Set(closed.map(mergeResultOf).map((uri) => uri?.toString()));
        for (const [key, served] of this.servedByKey) {
            const result = served.result;
            if (!closedResults.has(result.toString()) || tabsShowing(result).length > 0) continue;
            const written = this.closingKeys.has(key)
                ? undefined
                : this.results.lastEditorWriteOf(result);
            this.servedByKey.delete(key);
            this.closingKeys.delete(key);
            [served.base, served.current, served.incoming].forEach((uri) =>
                this.inputs.deleteFile(uri),
            );
            this.results.deleteFile(result);
            this.onFinished(key, written);
        }
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
