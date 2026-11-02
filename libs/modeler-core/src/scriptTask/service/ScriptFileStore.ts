import { posix } from "path";

import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { notifiedErrorLogText } from "../../kernel/domain/errorLogText";
import { FileNotFound } from "../../kernel/domain/errors";
import { LoggerPort, SettingsPort, WorkspacePort } from "../../kernel/domain/hostPorts";
import { isWithinRoot } from "../../kernel/domain/rootContainment";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import {
    editorScriptDir,
    keepsScriptsInOsTemp,
    osTempScriptBaseDir,
    ScriptBaseDir,
    scriptFilePath,
    scriptGitignorePath,
    SpellForDisplay,
    workspaceScriptBaseDir,
} from "../domain/scriptBaseDir";
import { ScriptUri } from "../domain/ScriptUri";

const CATCH_ALL_GITIGNORE = "*\n";

/**
 * Where the inline scripts of each diagram live on disk, and the hygiene that
 * transient real files need: a `.gitignore` that keeps them out of version
 * control, and one sweep per base directory and process for the files a crashed
 * host left behind. Both hosts read, write and delete script files through it.
 */
export class ScriptFileStore {
    /** Cached so teardown deletes where the files went, even after the config folder changed. */
    private readonly baseDirByEditor = new Map<string, ScriptBaseDir>();

    /**
     * One sweep per base directory, awaited by every write into it: a later or
     * overlapping sweep would delete live scripts of the editors sharing it.
     */
    private readonly sweeps = new Map<string, Promise<void>>();

    /**
     * @param osTempDir The OS temp folder, spelled like the paths `workspace` answers.
     * @param spellForDisplay Turns such a path into the spelling the host shows the user.
     */
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly workspace: WorkspacePort,
        private readonly settings: SettingsPort,
        private readonly artifactSvc: ArtifactService,
        private readonly logger: LoggerPort,
        private readonly osTempDir: string,
        private readonly spellForDisplay: SpellForDisplay,
    ) {}

    /**
     * The `tmp/scripting` folder for the editor's scripts: below the config folder
     * of its workspace root, or in the OS temp folder for a document without a
     * file path. The scheme decides, because the workspace maps any id to some
     * directory (`untitled:Untitled-1` to `/`). A failed lookup rejects; it never
     * moves the scripts somewhere else.
     */
    async baseDirFor(editorId: string): Promise<string> {
        let baseDir = this.baseDirByEditor.get(editorId);
        if (baseDir === undefined) {
            baseDir = await this.resolveBaseDir(editorId);
            this.baseDirByEditor.set(editorId, baseDir);
        }
        return baseDir.path;
    }

    private async resolveBaseDir(editorId: string): Promise<ScriptBaseDir> {
        const handle = this.editorStore.requireHandle(editorId);
        if (keepsScriptsInOsTemp(handle.documentScheme())) {
            return osTempScriptBaseDir(this.osTempDir, this.spellForDisplay);
        }
        const documentDir = this.workspace.getDocumentDirectory(handle.documentFsPath());
        const workspaceRoot = await this.artifactSvc.getWorkspaceRoot(documentDir);
        return workspaceScriptBaseDir(
            workspaceRoot,
            this.settings.getConfigFolder(),
            this.spellForDisplay,
        );
    }

    /** Whether the editor opened, generated or adopted a script since it opened. */
    hasBaseDir(editorId: string): boolean {
        return this.baseDirByEditor.has(editorId);
    }

    /** The folder a message names for the editor's scripts, once {@link baseDirFor} resolved it. */
    displayNameFor(editorId: string): string | undefined {
        return this.baseDirByEditor.get(editorId)?.displayName;
    }

    /**
     * The path of the script's file in the editor's base directory, which is then
     * ready for the write: swept of orphans on its first use in this process, and
     * given a catch-all `.gitignore` when it has none, so a user's own edits to
     * that file stay. Each step is best-effort and logged on its own, so neither
     * blocks the write nor skips the other.
     */
    async prepareScriptFile(editorId: string, script: ScriptUri): Promise<string> {
        const baseDir = await this.baseDirFor(editorId);
        await this.sweepOnce(baseDir);
        await this.ensureGitignore(baseDir);
        return scriptFilePath(baseDir, script);
    }

    /**
     * Whether a script file opened outside the modeler lies in its editor's base
     * directory; the `tmp/scripting` marker alone matches any same-named user
     * folder. That directory then counts as swept: the adopted file is live, and
     * a first write after it must not delete it as an orphan.
     */
    async adopt(editorId: string, filePath: string): Promise<boolean> {
        const baseDir = await this.baseDirFor(editorId);
        if (!isWithinRoot(filePath, baseDir)) {
            return false;
        }
        if (!this.sweeps.has(baseDir)) {
            this.sweeps.set(baseDir, Promise.resolve());
        }
        return true;
    }

    /**
     * Forgets the editor's base directory and returns the folder that holds all
     * of its scripts, or `undefined` when it never had one. The caller deletes it
     * once the editor's script tabs have closed.
     */
    releaseEditor(editorId: string): string | undefined {
        const baseDir = this.baseDirByEditor.get(editorId);
        this.baseDirByEditor.delete(editorId);
        return baseDir === undefined ? undefined : editorScriptDir(baseDir.path, editorId);
    }

    writeFile(path: string, content: string): Promise<void> {
        return this.workspace.writeFile(path, content);
    }

    readFile(path: string): Promise<string> {
        return this.workspace.readFile(path);
    }

    /** Deletes the script's folder: its file and the ambient files written next to it. */
    deleteScript(scriptPath: string): Promise<void> {
        return this.deleteFolder(posix.dirname(scriptPath));
    }

    /** Deletes a script folder with its content; a failure is logged, never thrown. */
    async deleteFolder(path: string): Promise<void> {
        try {
            await this.workspace.deleteDirectory(path);
        } catch (error) {
            this.logFailure(`Could not delete the script folder ${path}`, error);
        }
    }

    /**
     * The first editor to write into a base directory shared with another window
     * deletes that window's script files too; its buffers and keystroke sync
     * survive, and a save recreates the file.
     */
    private sweepOnce(baseDir: string): Promise<void> {
        let sweep = this.sweeps.get(baseDir);
        if (sweep === undefined) {
            sweep = this.workspace
                .deleteDirectory(baseDir)
                .catch((error) =>
                    this.logFailure(`Could not sweep the script folder ${baseDir}`, error),
                );
            this.sweeps.set(baseDir, sweep);
        }
        return sweep;
    }

    private async ensureGitignore(baseDir: string): Promise<void> {
        const gitignorePath = scriptGitignorePath(baseDir);
        try {
            await this.workspace.readFile(gitignorePath);
            return;
        } catch (error) {
            if (!(error instanceof FileNotFound)) {
                this.logFailure(`Could not read ${gitignorePath}`, error);
                return;
            }
        }
        try {
            await this.workspace.writeFile(gitignorePath, CATCH_ALL_GITIGNORE);
        } catch (error) {
            this.logFailure(`Could not write ${gitignorePath}`, error);
        }
    }

    private logFailure(context: string, error: unknown): void {
        this.logger.logError(notifiedErrorLogText(context, error as Error));
    }
}
