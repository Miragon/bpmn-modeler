import { posix } from "path";

import {
    parseVariableManifest,
    VariableDef,
    VariableManifest,
    VariableManifestEntry,
} from "@miragon/bpmn-modeler-shared";

import { FileNotFound } from "../../shared/domain/errors";
import { SettingsPort, WorkspacePort } from "../../shared/domain/hostPorts";
import { ArtifactService } from "../../shared/service/ArtifactService";

const VARS_DIR = "vars";

/**
 * Reads (and watches) the `*.bpmn.vars.json` process-variable manifest, turning
 * it into the `authored`-tier variable model that overrides heuristic
 * extraction. Both hosts reuse it because it depends only on the shared
 * {@link WorkspacePort}/{@link SettingsPort} and {@link ArtifactService}; the
 * merge with extracted variables happens in the caller (the VS Code store / the
 * bridge editor) via `dedupeVariables`.
 *
 * The manifest lives under `<configFolder>/vars/<relativeBpmnPath>.vars.json`
 * (e.g. `src/order.bpmn` → `.camunda/vars/src/order.bpmn.vars.json`) rather than
 * beside the diagram. This declutters the diagram folder and mirrors the
 * code-link convention ({@link ArtifactService}/`CodeLinkMapService`): the
 * workspace-relative path is preserved so two same-named diagrams in different
 * folders don't collide.
 *
 * The service speaks the port's plain-fs-path vocabulary, not editor URIs: the
 * two {@link WorkspacePort} adapters disagree on scheme handling (VS Code reads
 * via `Uri.file`, expecting a bare path; the bridge strips `file://` itself), so
 * each host converts its editor URI to an fs path at the boundary — which is
 * also where the `file:`-scheme guard belongs, since a `git:`/`untitled:` diff
 * editor has no manifest on disk.
 */
export class ScriptVariableManifestService {
    constructor(
        private readonly workspace: WorkspacePort,
        private readonly settings: SettingsPort,
        private readonly artifactSvc: ArtifactService,
    ) {}

    /**
     * Loads the diagram's manifest as authored variables. Returns `[]` when the
     * manifest is absent so a diagram without one is indistinguishable from one
     * with an empty manifest. A malformed manifest yields `[]` from
     * {@link parseVariableManifest} (never throws); only unexpected read errors
     * propagate, so the host can surface them.
     */
    async load(documentPath: string): Promise<VariableDef[]> {
        const manifestPath = await this.manifestPathFor(documentPath);
        let jsonText: string;
        try {
            jsonText = await this.workspace.readFile(manifestPath);
        } catch (error) {
            if (error instanceof FileNotFound) {
                return [];
            }
            throw error;
        }
        // The origin label uses the bare manifest basename, unchanged by the
        // relocation (`order.bpmn.vars.json`), so origin strings stay stable.
        return parseVariableManifest(jsonText, posix.basename(manifestPath));
    }

    /**
     * Appends a name-only (or fully authored) entry to the diagram's manifest,
     * creating the file if absent, and returns the resolved manifest path so the
     * caller can open/reveal it for the author to fill in `type`/`description`.
     *
     * The raw on-disk JSON is round-tripped — parsed to the {@link VariableManifest}
     * shape rather than lowered through {@link parseVariableManifest} — so existing
     * entries keep their order and any unknown fields survive the rewrite. A
     * duplicate `name` is a no-op (the manifest watcher still won't re-fire on an
     * unchanged write, but skipping the push keeps the file byte-stable). A
     * malformed existing manifest propagates the parse error rather than silently
     * clobbering hand-edited content the author would lose.
     */
    async upsert(documentPath: string, entry: VariableManifestEntry): Promise<string> {
        const manifestPath = await this.manifestPathFor(documentPath);
        const manifest = await this.readRawManifest(manifestPath);

        if (!manifest.variables.some((existing) => existing.name === entry.name)) {
            manifest.variables.push(entry);
        }

        await this.workspace.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        return manifestPath;
    }

    /**
     * Reads the manifest as its mutable on-disk shape: an absent file starts from
     * an empty manifest; a present one keeps every top-level field (spread) so an
     * `upsert` only ever appends to `variables`. `variables` is coerced to an
     * array so a manifest that omits the key (or sets it to a non-array) still
     * accepts the new entry.
     */
    private async readRawManifest(
        manifestPath: string,
    ): Promise<VariableManifest & { variables: VariableManifestEntry[] }> {
        let jsonText: string;
        try {
            jsonText = await this.workspace.readFile(manifestPath);
        } catch (error) {
            if (error instanceof FileNotFound) {
                return { variables: [] };
            }
            throw error;
        }
        const parsed = JSON.parse(jsonText) as Partial<VariableManifest> & Record<string, unknown>;
        return {
            ...parsed,
            variables: Array.isArray(parsed.variables) ? [...parsed.variables] : [],
        };
    }

    /**
     * Watches the config folder for create/change/delete of this diagram's
     * manifest and fires `onChange` so the caller can reload + re-merge. Scoped
     * to the exact manifest path so edits to another diagram's manifest don't
     * trigger a needless reload.
     */
    async createWatcher(documentPath: string, onChange: () => void): Promise<{ dispose(): void }> {
        const documentDir = this.workspace.getDocumentDirectory(documentPath);
        const workspaceRoot = await this.artifactSvc.getWorkspaceRoot(documentDir);
        const manifestPath = await this.manifestPathFor(documentPath);
        // The chokidar/node adapter anchors the glob (`^…$`) and matches against
        // absolute paths, so a root-relative glob must be prefixed `**/` to match
        // the bridge the same way VS Code does (the template watcher does the same).
        const glob = `**/${posix.relative(workspaceRoot, manifestPath)}`;
        return this.workspace.createWatcher(workspaceRoot, glob, {
            onCreate: () => onChange(),
            onChange: () => onChange(),
            onDelete: () => onChange(),
        });
    }

    /**
     * `<root>/src/foo.bpmn` → `<root>/<configFolder>/vars/src/foo.bpmn.vars.json`,
     * mirroring the diagram's workspace-relative path under the config folder.
     */
    private async manifestPathFor(documentPath: string): Promise<string> {
        // Compute everything in the `uri.path` space `getDocumentDirectory`
        // returns: on Windows the raw `documentPath` is `fsPath` (`c:\a\b`) while
        // the directory is `uri.path` (`/c:/a/b`), so a relative path derived
        // from the raw path would be garbage. Take the basename from the
        // normalized path and join it onto the directory.
        const documentDir = this.workspace.getDocumentDirectory(documentPath);
        const workspaceRoot = await this.artifactSvc.getWorkspaceRoot(documentDir);
        const fileName = posix.basename(documentPath.replace(/\\/g, "/"));
        const relBpmn = posix.relative(workspaceRoot, posix.join(documentDir, fileName));
        return posix.join(
            workspaceRoot,
            this.settings.getConfigFolder(),
            VARS_DIR,
            `${relBpmn}.vars.json`,
        );
    }
}
