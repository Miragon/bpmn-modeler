import { tmpdir } from "os";
import { posix } from "path";

import {
    ArtifactService,
    FileNotFound,
    SettingsPort,
    TMP_SCRIPTING_SEGMENT,
    WorkspacePort,
} from "@miragon/bpmn-modeler-core";

/**
 * Filesystem home of the on-disk inline scripts.
 *
 * Resolves where a script file lives (`<workspaceRoot>/<configFolder>/tmp/
 * scripting/…`, mirroring where the vars manifests already resolve to) and
 * owns the disk hygiene transient real files require: a `.gitignore` so
 * scripts can't land in version control, and an activation-time sweep for
 * files orphaned by a crashed or killed window.
 *
 * Kept apart from {@link ScriptTaskService} so the service stays a pure
 * editor-lifecycle orchestrator and tests can stub the disk with a map.
 */
export class ScriptFileStore {
    constructor(
        private readonly workspace: WorkspacePort,
        private readonly settings: SettingsPort,
        private readonly artifactSvc: ArtifactService,
    ) {}

    /**
     * Base directory for the given BPMN editor's scripts.
     *
     * `ArtifactService.getWorkspaceRoot` already degrades gracefully
     * (workspace folder → git root → document directory), so a diagram outside
     * every workspace folder still gets a config-folder-relative home — the
     * same one its vars manifest would resolve to. Only a document whose id
     * cannot be mapped to a directory at all (non-file scheme) falls back to
     * the OS temp dir; the path keeps the `tmp/scripting` marker segments so
     * completion-provider selectors and `parseScriptPath` still match.
     */
    async resolveBaseDir(editorId: string): Promise<string> {
        try {
            const documentDir = this.workspace.getDocumentDirectory(editorId);
            const workspaceRoot = await this.artifactSvc.getWorkspaceRoot(documentDir);
            return posix.join(
                workspaceRoot,
                this.settings.getConfigFolder(),
                TMP_SCRIPTING_SEGMENT,
            );
        } catch {
            return this.fallbackBaseDir();
        }
    }

    /** OS-tmpdir home for scripts of documents that have no resolvable folder. */
    private fallbackBaseDir(): string {
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
     * Activation-time sweep of script directories orphaned by a crash or
     * killed window (the tab-close/dispose cleanup never ran). Sweeps every
     * open workspace folder's scripting dir plus the OS-tmpdir fallback.
     *
     * Trade-off, accepted knowingly: a second window sharing this workspace
     * has its live script files deleted by our sweep — its open buffers and
     * keystroke streaming survive, so no edits are lost, and a save recreates
     * the file.
     */
    async sweepOrphans(): Promise<void> {
        const roots = this.workspace
            .getWorkspaceFolderPaths()
            .map((root) =>
                posix.join(root, this.settings.getConfigFolder(), TMP_SCRIPTING_SEGMENT),
            );
        roots.push(this.fallbackBaseDir());
        await Promise.all(roots.map((dir) => this.workspace.deleteDirectory(dir)));
    }
}
