import { VariableDef } from "@miragon/bpmn-modeler-shared";

import { ScriptUri } from "./ScriptUri";

/**
 * Holds the latest process-variable model per BPMN editor so the script
 * completion provider can serve variable-name suggestions for any inline script
 * opened from that editor. The model is the one the webview extracts from the
 * diagram and replaces on every model edit.
 *
 * Keyed by the one-way {@link ScriptUri.hashEditorId} hash rather than the raw
 * editor id because that hash is the only addressing a script file path
 * carries — the provider recovers it from the document path, never the original
 * editor URI. Keeping the store pure (no `vscode` import) lets both the VS Code
 * plugin and the bridge tests drive it directly.
 */
export class ScriptVariableStore {
    private readonly extractedByEditorHash = new Map<string, VariableDef[]>();

    /** Replaces the webview-extracted model for an editor. */
    setExtracted(editorId: string, variables: VariableDef[]): void {
        this.extractedByEditorHash.set(ScriptUri.hashEditorId(editorId), variables);
    }

    /** Variables for a script URI's editor hash; empty when the editor is unknown. */
    getByEditorHash(editorHash: string): VariableDef[] {
        return this.extractedByEditorHash.get(editorHash) ?? [];
    }

    variablesFor(_editorId: string): VariableDef[] {
        return [];
    }

    /** Drops the editor's model on teardown so closed editors leave no stale completions. */
    clear(editorId: string): void {
        this.extractedByEditorHash.delete(ScriptUri.hashEditorId(editorId));
    }
}
