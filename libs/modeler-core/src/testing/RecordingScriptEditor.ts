import { isSameScript } from "@miragon/bpmn-modeler-types";

import { EditorSessionStore } from "../editorSession/service/EditorSessionStore";
import { InlineScript, ScriptSourceChange } from "../scriptTask/domain/inlineScript";
import { OpenScriptTab, OpenScriptTabs } from "../scriptTask/domain/OpenScriptTabs";
import { ScriptMaterialization } from "../scriptTask/domain/scriptBatchSummary";
import { matchScriptFile } from "../scriptTask/domain/scriptFileMatching";
import { ScriptEditorPort } from "../scriptTask/port/ScriptEditorPort";
import { ScriptFileStore } from "../scriptTask/service/ScriptFileStore";
import { ScriptTargetResolver } from "../scriptTask/service/ScriptTargetResolver";

export interface ScriptEditorCall<TScript> {
    readonly editorId: string;
    readonly script: TScript;
}

/**
 * A host's script tabs in memory: holds what was opened, written, changed,
 * resynced and closed, and keeps the `ScriptEditorPort` contract
 * (`describeScriptEditorContract`). It resolves each script's file with
 * `targets`, writes through `scriptFiles`, adopts a script file the user opens
 * from its editor's script folder and answers `alreadyOpen` for a script whose
 * tab is open. A spec steers it only to inject a failure or a hang:
 * `writeInterruptions` fails or holds the next writes in order (an `Error`
 * rejects that write; a `Promise` holds it until it settles, then the write
 * goes on), and `openFailure` and `resyncFailure` reject `open` and `resync`
 * while set.
 */
export class RecordingScriptEditor implements ScriptEditorPort {
    readonly opened: ScriptEditorCall<InlineScript>[] = [];
    readonly written: ScriptEditorCall<InlineScript>[] = [];
    readonly modelChanges: ScriptEditorCall<ScriptSourceChange>[] = [];
    readonly resynced: string[] = [];
    readonly variablePushes: string[] = [];
    readonly disposedEditors: string[] = [];
    readonly writeInterruptions: (Error | Promise<void>)[] = [];
    openFailure: Error | undefined;
    resyncFailure: Error | undefined;

    /** Open tabs by the path of the file each shows. */
    private readonly openTabs = new OpenScriptTabs();

    constructor(
        private readonly store: EditorSessionStore,
        private readonly scriptFiles: ScriptFileStore,
        private readonly targets: ScriptTargetResolver,
    ) {}

    async open(editorId: string, script: InlineScript): Promise<void> {
        this.opened.push({ editorId, script: inlineScriptOf(script) });
        if (this.openFailure) throw this.openFailure;
        const target = await this.targets.resolve(editorId, script);
        if (target === undefined) return;
        const filePath = await this.scriptFiles.prepareScriptFile(editorId, target.uri);
        if (this.openTabs.isOpen(filePath)) return;
        await this.scriptFiles.writeFile(filePath, script.content);
        const { elementId, kind, listenerIndex } = script;
        this.openTabs.track(filePath, { editorId, elementId, kind, listenerIndex });
    }

    async materialize(editorId: string, script: InlineScript): Promise<ScriptMaterialization> {
        this.written.push({ editorId, script: inlineScriptOf(script) });
        const interruption = this.writeInterruptions.shift();
        if (interruption instanceof Error) throw interruption;
        await interruption;

        const target = await this.targets.resolve(editorId, script);
        if (target === undefined) return { kind: "cancelled" };
        const filePath = await this.scriptFiles.prepareScriptFile(editorId, target.uri);
        const plan = this.openTabs.materializationOf(filePath);
        if (plan.kind === "alreadyOpen") return plan;
        await this.scriptFiles.writeFile(filePath, script.content);
        return { kind: "written" };
    }

    applyModelChange(editorId: string, change: ScriptSourceChange): void {
        const { elementId, kind, listenerIndex, content } = change;
        this.modelChanges.push({ editorId, script: { elementId, kind, listenerIndex, content } });
        if (content !== undefined) return;
        this.closeTabsWhere(editorId, (tab) => isSameScript(tab, change));
    }

    async resync(editorId: string): Promise<void> {
        this.resynced.push(editorId);
        if (this.resyncFailure) throw this.resyncFailure;
    }

    variablesChanged(editorId: string): void {
        this.variablePushes.push(editorId);
    }

    disposeEditor(editorId: string): void {
        this.disposedEditors.push(editorId);
        this.closeTabsWhere(editorId, () => true);
        const editorScriptDir = this.scriptFiles.releaseEditor(editorId);
        if (editorScriptDir !== undefined) void this.scriptFiles.deleteFolder(editorScriptDir);
    }

    /** The user opened the file at `filePath` outside `open`; a script file in its editor's script folder gets a tab. */
    async openFileByUser(filePath: string): Promise<void> {
        const match = matchScriptFile(filePath, this.store.getEditorIds());
        if (match === undefined) return;
        if (!(await this.scriptFiles.adopt(match.editorId, filePath))) return;
        const { editorId, elementId, kind, listenerIndex } = match;
        this.openTabs.track(filePath, { editorId, elementId, kind, listenerIndex });
    }

    /** The user closed the tab of the script file at `filePath`. */
    closeTab(filePath: string): void {
        this.openTabs.untrack(filePath);
    }

    private closeTabsWhere(editorId: string, closes: (tab: OpenScriptTab) => boolean): void {
        for (const [filePath, tab] of this.openTabs.ofEditor(editorId)) {
            if (closes(tab)) this.openTabs.untrack(filePath);
        }
    }
}

/** Only the script's own fields, so a recorded webview command compares like a plain script. */
function inlineScriptOf(script: InlineScript): InlineScript {
    const { elementId, kind, listenerIndex, eventName, scriptFormat, content } = script;
    return { elementId, kind, listenerIndex, eventName, scriptFormat, content };
}
