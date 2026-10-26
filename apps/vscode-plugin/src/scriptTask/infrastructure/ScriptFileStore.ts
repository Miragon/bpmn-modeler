import { tmpdir } from "os";
import { posix } from "path";

import {
    ArtifactService,
    EditorSessionStore,
    FileNotFound,
    SettingsPort,
    TMP_SCRIPTING_SEGMENT,
    WorkspacePort,
} from "@miragon/bpmn-modeler-core";

/**
 * A document without a filesystem path (`untitled:`, a virtual file system)
 * has no folder for its scripts.
 */
export function keepsScriptsInOsTemp(documentScheme: string): boolean {
    return documentScheme !== "file";
}

/**
 * Filesystem home of the on-disk inline scripts.
 *
 * Resolves where a script file lives (`<workspaceRoot>/<configFolder>/tmp/
 * scripting/…`) and owns the disk hygiene transient real files require: a
 * `.gitignore` so scripts can't land in version control, and a one-shot sweep
 * per base directory for files orphaned by a crashed or killed window.
 *
 * Kept apart from {@link ScriptTaskService} so the service stays a pure
 * editor-lifecycle orchestrator and tests can stub the disk with a map.
 */
export class ScriptFileStore {
    /**
     * Base directories already swept this process. The orphan sweep (files a
     * crashed window left behind) must run exactly once per directory and
     * strictly before the first file is written into it — a later sweep would
     * delete live scripts of other editors sharing the directory.
     */
    private readonly sweptBaseDirs = new Set<string>();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly workspace: WorkspacePort,
        private readonly settings: SettingsPort,
        private readonly artifactSvc: ArtifactService,
    ) {}

    /**
     * Base directory for the given BPMN editor's scripts.
     *
     * `ArtifactService.getWorkspaceRoot` already degrades gracefully
     * (workspace folder → git root → document directory), so a `file:` diagram
     * outside every workspace folder still gets a config-folder-relative home.
     * Every other diagram goes to the OS temp dir, chosen by its scheme because
     * the workspace maps any id to some directory (`untitled:Untitled-1` to `/`)
     * instead of failing. The temp path keeps the `tmp/scripting` marker
     * segments so completion-provider selectors and `parseScriptPath` still
     * match.
     */
    async resolveBaseDir(editorId: string): Promise<string> {
        if (keepsScriptsInOsTemp(this.editorStore.requireHandle(editorId).documentScheme())) {
            return this.osTempBaseDir();
        }
        const documentDir = this.workspace.getDocumentDirectory(editorId);
        const workspaceRoot = await this.artifactSvc.getWorkspaceRoot(documentDir);
        return posix.join(workspaceRoot, this.settings.getConfigFolder(), TMP_SCRIPTING_SEGMENT);
    }

    private osTempBaseDir(): string {
        return posix.join(
            tmpdir().replace(/\\/g, "/"),
            "miragon-bpmn-modeler",
            TMP_SCRIPTING_SEGMENT,
        );
    }

    async writeFile(path: string, content: string): Promise<void> {
        await this.workspace.writeFile(path, content);
    }

    async readFile(path: string): Promise<string> {
        return this.workspace.readFile(path);
    }

    /** Recursively deletes `path`; a missing target is a no-op. */
    async deleteDir(path: string): Promise<void> {
        await this.workspace.deleteDirectory(path);
    }

    /**
     * Drops a `.gitignore` containing `*` into `<configFolder>/tmp/` (the
     * parent of the scripting dir) so transient script files never show up in
     * `git status` or land in a commit. Only written when absent, so a user
     * who deliberately edits it is not fought.
     */
    async ensureGitignore(baseDir: string): Promise<void> {
        const gitignorePath = posix.join(posix.dirname(baseDir), ".gitignore");
        try {
            await this.workspace.readFile(gitignorePath);
        } catch (error) {
            if (error instanceof FileNotFound) {
                await this.workspace.writeFile(gitignorePath, "*\n");
                return;
            }
            throw error;
        }
    }

    /**
     * Sweeps `baseDir` of files orphaned by a crash or killed window (the
     * tab-close/dispose cleanup never ran) the first time the directory is used
     * this process, then marks it swept. Idempotent per directory, so a second
     * editor sharing the dir can't wipe the first's live scripts; the sweep runs
     * strictly before the first file is written, so it only removes leftovers of
     * a previous window. Best-effort — a delete failure must not block writing.
     *
     * Trade-off, accepted knowingly: the first editor to open a script in a
     * shared base dir deletes any live script files a *second* window left there
     * — those buffers and keystroke streaming survive, so no edits are lost and
     * a save recreates the file.
     */
    async prepareBaseDir(baseDir: string): Promise<void> {
        if (this.sweptBaseDirs.has(baseDir)) {
            return;
        }
        // Mark before the delete so a failed sweep isn't retried on every write.
        this.sweptBaseDirs.add(baseDir);
        try {
            await this.workspace.deleteDirectory(baseDir);
        } catch {
            // Best-effort: a sweep failure must not block materialising scripts.
        }
    }

    /**
     * Marks `baseDir` swept without sweeping it — the adoption path uses this so
     * a later write-path {@link prepareBaseDir} spares the file it just adopted
     * (the adopted file is live, not an orphan).
     */
    markSwept(baseDir: string): void {
        this.sweptBaseDirs.add(baseDir);
    }
}
