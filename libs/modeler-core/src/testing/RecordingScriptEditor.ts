import { InlineScript, ScriptEditorPort, ScriptSourceChange } from "../scriptTask/domain/ports";
import { ScriptMaterialization } from "../scriptTask/domain/scriptBatchSummary";

export interface ScriptEditorCall<TScript> {
    readonly editorId: string;
    readonly script: TScript;
}

/**
 * A host's script tabs in memory: holds what was opened, written, changed,
 * resynced and closed. `materializations` answers the next writes in order
 * (`written` once it runs out); an `Error` in it rejects that write.
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

    async open(editorId: string, script: InlineScript): Promise<void> {
        this.opened.push({ editorId, script: inlineScriptOf(script) });
        if (this.openFailure) throw this.openFailure;
    }

    async materialize(editorId: string, script: InlineScript): Promise<ScriptMaterialization> {
        this.written.push({ editorId, script: inlineScriptOf(script) });
        const next = this.materializations.shift() ?? { kind: "written" };
        if (next instanceof Error) throw next;
        return next;
    }

    applyModelChange(editorId: string, change: ScriptSourceChange): void {
        const { elementId, kind, listenerIndex, content } = change;
        this.modelChanges.push({ editorId, script: { elementId, kind, listenerIndex, content } });
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
    }
}

/** Only the script's own fields, so a recorded webview command compares like a plain script. */
function inlineScriptOf(script: InlineScript): InlineScript {
    const { elementId, kind, listenerIndex, eventName, scriptFormat, content } = script;
    return { elementId, kind, listenerIndex, eventName, scriptFormat, content };
}
