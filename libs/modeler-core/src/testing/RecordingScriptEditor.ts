import { EditorSessionStore } from "../editorSession/service/EditorSessionStore";
import { PickerPort } from "../kernel/port/hostPorts";
import { InlineScript, ScriptAddress, ScriptSourceChange } from "../scriptTask/domain/inlineScript";
import { ScriptMaterialization } from "../scriptTask/domain/scriptBatchSummary";
import { matchScriptFile } from "../scriptTask/domain/scriptFileMatching";
import { ScriptLanguage, scriptLanguagePrompt } from "../scriptTask/domain/scriptLanguage";
import { ScriptUri } from "../scriptTask/domain/ScriptUri";
import { ScriptEditorPort } from "../scriptTask/port/ScriptEditorPort";
import { ScriptFileStore } from "../scriptTask/service/ScriptFileStore";

export interface ScriptEditorCall<TScript> {
    readonly editorId: string;
    readonly script: TScript;
}

interface OpenTab extends ScriptAddress {
    readonly editorId: string;
}

/**
 * A host's script tabs in memory: holds what was opened, written, changed,
 * resynced and closed, and keeps the `ScriptEditorPort` contract
 * (`describeScriptEditorContract`). It asks `picker` for a language the model
 * lacks, writes through `scriptFiles`, adopts a script file the user opens
 * from its editor's script folder and answers `alreadyOpen` for a script whose
 * tab is open. `materializations` answers the next writes in order
 * instead, writing nothing; an `Error` in it rejects that write.
 */
export class RecordingScriptEditor implements ScriptEditorPort {
    readonly opened: ScriptEditorCall<InlineScript>[] = [];
    readonly written: ScriptEditorCall<InlineScript>[] = [];
    readonly modelChanges: ScriptEditorCall<ScriptSourceChange>[] = [];
    readonly resynced: string[] = [];
    readonly variablePushes: string[] = [];
    readonly disposedEditors: string[] = [];
    readonly materializations: (ScriptMaterialization | Error | Promise<ScriptMaterialization>)[] =
        [];
    openFailure: Error | undefined;
    resyncFailure: Error | undefined;

    /** Open tabs by the path of the file each shows. */
    private readonly openTabs = new Map<string, OpenTab>();

    constructor(
        private readonly store: EditorSessionStore,
        private readonly scriptFiles: ScriptFileStore,
        private readonly picker: PickerPort,
    ) {}

    async open(editorId: string, script: InlineScript): Promise<void> {
        this.opened.push({ editorId, script: inlineScriptOf(script) });
        if (this.openFailure) throw this.openFailure;
        const uri = await this.scriptUriOf(editorId, script);
        if (uri === undefined) return;
        const { elementId, kind, listenerIndex } = script;
        this.openTabs.set(await this.scriptFiles.prepareScriptFile(editorId, uri), {
            editorId,
            elementId,
            kind,
            listenerIndex,
        });
    }

    async materialize(editorId: string, script: InlineScript): Promise<ScriptMaterialization> {
        this.written.push({ editorId, script: inlineScriptOf(script) });
        const scripted = this.materializations.shift();
        if (scripted instanceof Error) throw scripted;
        if (scripted !== undefined) return scripted;

        const uri = await this.scriptUriOf(editorId, script);
        if (uri === undefined) return { kind: "cancelled" };
        const filePath = await this.scriptFiles.prepareScriptFile(editorId, uri);
        if (this.openTabs.has(filePath)) return { kind: "alreadyOpen" };
        await this.scriptFiles.writeFile(filePath, script.content);
        return { kind: "written" };
    }

    applyModelChange(editorId: string, change: ScriptSourceChange): void {
        const { elementId, kind, listenerIndex, content } = change;
        this.modelChanges.push({ editorId, script: { elementId, kind, listenerIndex, content } });
        if (content !== undefined) return;
        this.closeTabsWhere(
            (tab) =>
                tab.editorId === editorId &&
                tab.elementId === elementId &&
                tab.kind === kind &&
                (tab.listenerIndex ?? 0) === (listenerIndex ?? 0),
        );
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
        this.closeTabsWhere((tab) => tab.editorId === editorId);
        const editorScriptDir = this.scriptFiles.releaseEditor(editorId);
        if (editorScriptDir !== undefined) void this.scriptFiles.deleteFolder(editorScriptDir);
    }

    /** The user opened the file at `filePath` outside `open`; a script file in its editor's script folder gets a tab. */
    async openFileByUser(filePath: string): Promise<void> {
        const match = matchScriptFile(filePath, this.store.getEditorIds());
        if (match === undefined) return;
        if (!(await this.scriptFiles.adopt(match.editorId, filePath))) return;
        const { editorId, elementId, kind, listenerIndex } = match;
        this.openTabs.set(filePath, { editorId, elementId, kind, listenerIndex });
    }

    /** The user closed the tab of the script file at `filePath`. */
    closeTab(filePath: string): void {
        this.openTabs.delete(filePath);
    }

    private closeTabsWhere(closes: (tab: OpenTab) => boolean): void {
        for (const [filePath, tab] of this.openTabs) {
            if (closes(tab)) this.openTabs.delete(filePath);
        }
    }

    /** The script's file identity, in the model's language or the one picked; `undefined` when the pick is dismissed. */
    private async scriptUriOf(
        editorId: string,
        { elementId, kind, listenerIndex, eventName, scriptFormat }: InlineScript,
    ): Promise<ScriptUri | undefined> {
        const format = ScriptLanguage.isSupported(scriptFormat)
            ? scriptFormat
            : await this.picker.choose(scriptLanguagePrompt(scriptFormat));
        if (format === undefined) return undefined;
        const { extension } = new ScriptLanguage(format);
        return new ScriptUri(editorId, elementId, kind, listenerIndex, eventName, extension);
    }
}

/** Only the script's own fields, so a recorded webview command compares like a plain script. */
function inlineScriptOf(script: InlineScript): InlineScript {
    const { elementId, kind, listenerIndex, eventName, scriptFormat, content } = script;
    return { elementId, kind, listenerIndex, eventName, scriptFormat, content };
}
