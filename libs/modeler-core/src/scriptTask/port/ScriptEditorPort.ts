import { InlineScript, ScriptSourceChange } from "../domain/inlineScript";
import { ScriptMaterialization } from "../domain/scriptBatchSummary";

/**
 * The host's editor tabs for inline scripts. The host writes each script to
 * its file, opens it beside the diagram and streams the tab's edits back into
 * the model.
 */
export interface ScriptEditorPort {
    /** Opens the script's tab, or reveals an open one; asks for a language the model lacks. */
    open(editorId: string, script: InlineScript): Promise<void>;
    /** Writes the script's file without opening a tab; a failed write rejects. */
    materialize(editorId: string, script: InlineScript): Promise<ScriptMaterialization>;
    /** Applies a model-side change to the script's open tab, and closes it once the script is gone. */
    applyModelChange(editorId: string, change: ScriptSourceChange): void | Promise<void>;
    /** The editor's webview (re)loaded: replays edits it missed and locks the fields of open scripts again. */
    resync(editorId: string): void | Promise<void>;
    /** The editor's process variables changed; a host that hands them to its tabs pushes them. */
    variablesChanged(editorId: string): void;
    /** The editor closed: closes its script tabs and deletes its script files. */
    disposeEditor(editorId: string): void;
}
