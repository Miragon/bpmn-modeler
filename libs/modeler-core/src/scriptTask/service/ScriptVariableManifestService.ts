import { posix } from "path";

import { parseVariableManifest, VariableDef } from "@miragon/bpmn-modeler-shared";

import { FileNotFound } from "../../shared/domain/errors";
import { WorkspacePort } from "../../shared/domain/hostPorts";

/**
 * Reads (and watches) the `*.bpmn.vars.json` manifest that may sit next to a
 * diagram, turning it into the `authored`-tier variable model that overrides
 * heuristic extraction. Both hosts reuse it because it depends only on the
 * shared {@link WorkspacePort}; the merge with extracted variables happens in
 * the caller (the VS Code store / the bridge editor) via `dedupeVariables`.
 *
 * The service speaks the port's plain-fs-path vocabulary, not editor URIs: the
 * two {@link WorkspacePort} adapters disagree on scheme handling (VS Code reads
 * via `Uri.file`, expecting a bare path; the bridge strips `file://` itself), so
 * each host converts its editor URI to an fs path at the boundary — which is
 * also where the `file:`-scheme guard belongs, since a `git:`/`untitled:` diff
 * editor has no sibling on disk.
 */
export class ScriptVariableManifestService {
    constructor(private readonly workspace: WorkspacePort) {}

    /**
     * Loads `<documentPath>.vars.json` as authored variables. Returns `[]` when
     * the manifest is absent so a diagram without one is indistinguishable from
     * one with an empty manifest. A malformed manifest yields `[]` from
     * {@link parseVariableManifest} (never throws); only unexpected read errors
     * propagate, so the host can surface them.
     */
    async load(documentPath: string): Promise<VariableDef[]> {
        const manifestPath = this.manifestPathFor(documentPath);
        let jsonText: string;
        try {
            jsonText = await this.workspace.readFile(manifestPath);
        } catch (error) {
            if (error instanceof FileNotFound) {
                return [];
            }
            throw error;
        }
        return parseVariableManifest(jsonText, posix.basename(manifestPath));
    }

    /**
     * Watches the document directory for create/change/delete of the manifest
     * and fires `onChange` so the caller can reload + re-merge. Scoped to the
     * exact manifest filename so edits to a sibling diagram's manifest don't
     * trigger a needless reload.
     */
    createWatcher(documentPath: string, onChange: () => void): { dispose(): void } {
        const directory = this.workspace.getDocumentDirectory(documentPath);
        const glob = posix.basename(this.manifestPathFor(documentPath));
        return this.workspace.createWatcher(directory, glob, {
            onCreate: () => onChange(),
            onChange: () => onChange(),
            onDelete: () => onChange(),
        });
    }

    /** `foo.bpmn` → `<dir>/foo.bpmn.vars.json`, in the port's fs-path space. */
    private manifestPathFor(documentPath: string): string {
        const directory = this.workspace.getDocumentDirectory(documentPath);
        // Host fs paths aren't guaranteed posix: on Windows both VS Code's
        // `uri.fsPath` and the bridge `fsPath` use backslashes, so a raw
        // `posix.basename` would return the whole string and the computed
        // manifest path (and watcher glob) would never match. Normalize
        // separators first — `getDocumentDirectory` already does the equivalent.
        const fileName = posix.basename(documentPath.replace(/\\/g, "/"));
        return posix.join(directory, `${fileName}.vars.json`);
    }
}
