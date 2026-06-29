import { dedupeVariables, VariableDef } from "@miragon/bpmn-modeler-shared";

import { ScriptUri } from "./ScriptUri";

/**
 * Holds the latest process-variable model per BPMN editor so the script
 * completion provider can serve variable-name suggestions for any inline script
 * opened from that editor.
 *
 * Two sources are kept apart and merged on read: the *extracted* model the
 * webview heuristically derives from the diagram, and the *manifest* model read
 * from a `*.bpmn.vars.json` manifest under `<configFolder>/vars/`. They arrive
 * on independent schedules (the
 * webview on every model edit, the manifest on file change), so storing them
 * separately lets either update without clobbering the other. {@link dedupeVariables}
 * does the merge; the manifest's `authored` tier wins any name clash.
 *
 * Keyed by the one-way {@link ScriptUri.hashEditorId} hash rather than the raw
 * editor id because that hash is the only addressing a `bpmn-script://` URI
 * carries — the provider recovers it from the document path, never the original
 * editor URI. Keeping the store pure (no `vscode` import) lets both the VS Code
 * plugin and the bridge tests drive it directly.
 */
export class ScriptVariableStore {
    private readonly extractedByEditorHash = new Map<string, VariableDef[]>();
    private readonly manifestByEditorHash = new Map<string, VariableDef[]>();

    /** Replaces the heuristic (webview-extracted) model for an editor. */
    setExtracted(editorId: string, variables: VariableDef[]): void {
        this.extractedByEditorHash.set(ScriptUri.hashEditorId(editorId), variables);
    }

    /** Replaces the manifest (`*.bpmn.vars.json`) model for an editor. */
    setManifest(editorId: string, variables: VariableDef[]): void {
        this.manifestByEditorHash.set(ScriptUri.hashEditorId(editorId), variables);
    }

    /**
     * Merged variables for a script URI's editor hash; empty when the editor is
     * unknown. Manifest entries are listed first so their `authored` tier is the
     * one `dedupeVariables` keeps on a clash — order is intent, not dependence.
     */
    getByEditorHash(editorHash: string): VariableDef[] {
        const manifest = this.manifestByEditorHash.get(editorHash) ?? [];
        const extracted = this.extractedByEditorHash.get(editorHash) ?? [];
        return dedupeVariables([...manifest, ...extracted]);
    }

    /** Drops both sources on teardown so closed editors leave no stale completions. */
    clear(editorId: string): void {
        const hash = ScriptUri.hashEditorId(editorId);
        this.extractedByEditorHash.delete(hash);
        this.manifestByEditorHash.delete(hash);
    }
}
