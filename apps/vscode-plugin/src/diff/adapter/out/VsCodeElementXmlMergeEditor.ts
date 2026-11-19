import {
    commands,
    ExtensionContext,
    Tab,
    TabGroup,
    TextDocumentSaveReason,
    Uri,
    window,
    workspace,
} from "vscode";

import {
    ElementXmlMergeEditor,
    ElementXmlMergeFinished,
    ElementXmlMergeRequest,
    LoggerPort,
} from "@miragon/bpmn-modeler-core";

import { inMemoryViewUris } from "../../../shared/adapter/out/inMemoryViewUris";
import { closeUnservedTabs } from "../../../shared/adapter/out/unservedTabs";
import { EditorWrittenTextFiles, ServedTextFiles } from "../../../shared/port/ServedTextFiles";
import { MergeTabAnswer } from "../../domain/mergeTabAnswer";

import { groupBelowActive } from "./editorGroupBelow";

export const MERGE_XML_SCHEME = "bpmn-merge-xml";
export const MERGE_RESULT_SCHEME = "bpmn-merge-result";
export const OPEN_MERGE_EDITOR = "_open.mergeEditor";

// VS Code numbers its groups in grid order, as these commands count them.
const FOCUS_GROUP_COMMANDS = [
    "workbench.action.focusFirstEditorGroup",
    "workbench.action.focusSecondEditorGroup",
    "workbench.action.focusThirdEditorGroup",
    "workbench.action.focusFourthEditorGroup",
    "workbench.action.focusFifthEditorGroup",
    "workbench.action.focusSixthEditorGroup",
    "workbench.action.focusSeventhEditorGroup",
    "workbench.action.focusEighthEditorGroup",
];

interface OpenMerge {
    readonly request: ElementXmlMergeRequest;
    readonly base: Uri;
    readonly current: Uri;
    readonly incoming: Uri;
    readonly result: Uri;
    readonly answer: MergeTabAnswer;
}

/**
 * Opens one element's XML in VS Code's merge editor: base and both sides
 * read-only under `bpmn-merge-xml:`, the result writable under
 * `bpmn-merge-result:`, in a group below the diagrams or beside the merges
 * already open. The merge finishes when its last tab closes, with the text
 * its {@link MergeTabAnswer} names.
 */
export class VsCodeElementXmlMergeEditor implements ElementXmlMergeEditor {
    private readonly mergesByKey = new Map<string, OpenMerge>();

    constructor(
        private readonly inputs: ServedTextFiles<Uri>,
        private readonly results: EditorWrittenTextFiles<Uri>,
        private readonly onFinished: ElementXmlMergeFinished,
        private readonly logger: Pick<LoggerPort, "logError">,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            window.tabGroups.onDidChangeTabs((event) => this.finishClosed(event.closed)),
            workspace.onWillSaveTextDocument(({ document, reason }) =>
                this.mergeOfResult(document.uri)?.answer.willSave(
                    reason === TextDocumentSaveReason.Manual,
                ),
            ),
            workspace.onDidSaveTextDocument((document) => {
                const merge = this.mergeOfResult(document.uri);
                merge?.answer.saved(this.results.lastEditorWriteOf(merge.result));
            }),
        );
        closeUnservedTabs(
            context,
            (tab) => {
                const result = mergeResultOf(tab);
                return result?.scheme === MERGE_RESULT_SCHEME && !this.mergeOfResult(result);
            },
            this.logger,
        );
    }

    async open(request: ElementXmlMergeRequest): Promise<void> {
        if (this.mergesByKey.has(request.key)) {
            throw new Error(`The element XML merge ${request.key} is already open.`);
        }
        const merge = this.serve(request);
        try {
            const besideOpenMerges = this.groupOfOpenMerges();
            if (besideOpenMerges) await focusGroup(besideOpenMerges);
            else await groupBelowActive();
            await showMergeEditor(merge);
        } catch (error) {
            this.finish(request.key, merge, undefined);
            throw error;
        }
    }

    async focus(key: string): Promise<void> {
        const merge = this.mergesByKey.get(key);
        const tab = merge && tabsShowing(merge.result)[0];
        if (!merge || !tab) return;
        await focusGroup(tab.group);
        await showMergeEditor(merge);
    }

    /** Marks the merge of the active tab as being accepted until the returned call. */
    acceptingActiveMerge(): () => void {
        const tab = window.tabGroups.activeTabGroup.activeTab;
        const result = tab && mergeResultOf(tab);
        const merge = result && this.mergeOfResult(result);
        if (!merge) return () => undefined;
        merge.answer.accepting();
        return () => merge.answer.acceptEnded();
    }

    async close(key: string): Promise<void> {
        const merge = this.mergesByKey.get(key);
        if (!merge) return;
        // The command returns before the editor shows, so only here is a merge without a tab known to have none.
        if (tabsShowing(merge.result).length === 0) {
            this.finish(key, merge, undefined);
            return;
        }
        merge.answer.closingFromCode();
        // The result is dirty from the start, and closing a dirty result asks the user to save it.
        const result = workspace.textDocuments.find(
            (document) => document.uri.toString() === merge.result.toString(),
        );
        if (result) await result.save();
        const tabs = tabsShowing(merge.result);
        if (tabs.length > 0) await window.tabGroups.close(tabs, true);
    }

    private serve(request: ElementXmlMergeRequest): OpenMerge {
        const uriOf = inMemoryViewUris(request.elementId, "xml");
        const merge: OpenMerge = {
            request,
            base: uriOf(MERGE_XML_SCHEME, "base"),
            current: uriOf(MERGE_XML_SCHEME, "current"),
            incoming: uriOf(MERGE_XML_SCHEME, "incoming"),
            result: uriOf(MERGE_RESULT_SCHEME),
            answer: new MergeTabAnswer(),
        };
        this.inputs.setContent(merge.base, request.base);
        this.inputs.setContent(merge.current, request.current);
        this.inputs.setContent(merge.incoming, request.incoming);
        this.results.setContent(merge.result, request.start);
        this.mergesByKey.set(request.key, merge);
        return merge;
    }

    private groupOfOpenMerges(): TabGroup | undefined {
        for (const merge of this.mergesByKey.values()) {
            const tab = tabsShowing(merge.result)[0];
            if (tab) return tab.group;
        }
        return undefined;
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
            this.finish(key, merge, merge.answer.onClose(this.results.lastEditorWriteOf(merge.result)));
        }
    }

    private finish(key: string, merge: OpenMerge, written: string | undefined): void {
        this.mergesByKey.delete(key);
        [merge.base, merge.current, merge.incoming].forEach((uri) => this.inputs.deleteFile(uri));
        this.results.deleteFile(merge.result);
        this.onFinished(key, written);
    }
}

// The command opens in the active group; an open merge of the same result there comes to the front.
async function showMergeEditor(merge: OpenMerge): Promise<void> {
    await commands.executeCommand(OPEN_MERGE_EDITOR, {
        base: merge.base,
        input1: { uri: merge.current, title: merge.request.labels.current },
        input2: { uri: merge.incoming, title: merge.request.labels.incoming },
        output: merge.result,
    });
}

async function focusGroup(group: TabGroup): Promise<void> {
    const command = FOCUS_GROUP_COMMANDS[group.viewColumn - 1];
    if (command) await commands.executeCommand(command);
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
