import { posix } from "path";

import { configFolderPath } from "../../kernel/domain/configArtifacts";
import { relativeToRoot } from "../../kernel/domain/rootContainment";
import { joinWorkspacePath, toWorkspacePath } from "../../kernel/domain/workspacePath";
import { ScriptUri, TMP_SCRIPTING_SEGMENT } from "./ScriptUri";

/** The `tmp/scripting` folder that holds one editor's scripts. */
export interface ScriptBaseDir {
    readonly path: string;
    /** What a message names: the path below the workspace root, or the whole path outside one. */
    readonly displayName: string;
}

/**
 * A document without a filesystem path (`untitled:`, a virtual file system)
 * has no folder for its scripts.
 */
export function keepsScriptsInOsTemp(documentScheme: string): boolean {
    return documentScheme !== "file";
}

/** Keeps the `tmp/scripting` marker, by which `parseScriptPath` finds a script's segments. */
export function osTempScriptBaseDir(
    osTempDir: string,
    _spellForDisplay: (path: string) => string,
): ScriptBaseDir {
    const path = joinWorkspacePath(osTempDir, "miragon-bpmn-modeler", TMP_SCRIPTING_SEGMENT);
    return { path, displayName: path };
}

export function workspaceScriptBaseDir(
    workspaceRoot: string,
    configFolder: string,
    _spellForDisplay: (path: string) => string,
): ScriptBaseDir {
    const path = configFolderPath(workspaceRoot, configFolder, TMP_SCRIPTING_SEGMENT);
    return { path, displayName: relativeToRoot(path, toWorkspacePath(workspaceRoot)) || path };
}

/** One level up, so it covers all of `tmp/`. */
export function scriptGitignorePath(baseDir: string): string {
    return joinWorkspacePath(posix.dirname(baseDir), ".gitignore");
}

export function scriptFilePath(baseDir: string, script: ScriptUri): string {
    return joinWorkspacePath(baseDir, script.relativePath());
}

export function editorScriptDir(baseDir: string, editorId: string): string {
    return joinWorkspacePath(baseDir, ScriptUri.hashEditorId(editorId));
}
