import { VariableDef } from "@miragon/bpmn-modeler-shared";

import { ScriptUri } from "./ScriptUri";

/**
 * Holds the latest process-variable model per BPMN editor so the script
 * completion provider can serve variable-name suggestions for any inline script
 * opened from that editor.
 *
 * Keyed by the one-way {@link ScriptUri.hashEditorId} hash rather than the raw
 * editor id because that hash is the only addressing a `bpmn-script://` URI
 * carries — the provider recovers it from the document path, never the original
 * editor URI. Keeping the store pure (no `vscode` import) lets both the VS Code
 * plugin and the bridge tests drive it directly.
 */
export class ScriptVariableStore {
    private readonly byEditorHash = new Map<string, VariableDef[]>();

    /** Replaces the variable model for an editor (full re-extraction, never merge). */
    set(editorId: string, variables: VariableDef[]): void {
        this.byEditorHash.set(ScriptUri.hashEditorId(editorId), variables);
    }

    /** Variables for a script URI's editor hash; empty when the editor is unknown. */
    getByEditorHash(editorHash: string): VariableDef[] {
        return this.byEditorHash.get(editorHash) ?? [];
    }

    /** Drops an editor's variables on teardown so closed editors leave no stale completions. */
    clear(editorId: string): void {
        this.byEditorHash.delete(ScriptUri.hashEditorId(editorId));
    }
}
