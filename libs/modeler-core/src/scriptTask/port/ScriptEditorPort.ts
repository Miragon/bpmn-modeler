import { InlineScript } from "../domain/inlineScript";
import { OpenScriptTab } from "../domain/OpenScriptTabs";
import { MatchedScriptFile } from "../domain/scriptFileMatching";
import { ScriptLanguage } from "../domain/scriptLanguage";
import { ScriptUri } from "../domain/ScriptUri";

/** A script's file and tab, under the tab path the host named for it. */
export interface ScriptTabTarget {
    readonly tabPath: string;
    readonly editorId: string;
    readonly uri: ScriptUri;
    readonly language: ScriptLanguage;
}

/** What the host reports about its script tabs. */
export interface ScriptTabListener {
    /** The tab at `tabPath` holds new content: the user typed, or its file changed on disk. */
    didChange(tabPath: string, content: string): void;
    /** No tab shows `tabPath` any more; resolves once its last edit reached the model. */
    didClose(tabPath: string): Promise<void>;
    /** The user opened the file at `filePath` outside the modeler. */
    didOpenFile(filePath: string): Promise<void>;
}

/**
 * The host's editor tabs for inline scripts. Which scripts have a tab, and
 * what a model change or a reload does to them, is the core's
 * `ScriptTabService`; the host writes the files, shows the tabs and reports
 * what the user does with them.
 */
export interface ScriptEditorPort {
    /** Reports the host's tab events to `listener` from now on. */
    listen(listener: ScriptTabListener): void;
    /** The path a tab of the script that `scriptId` names below the editor's script folder is tracked under. */
    tabPathOf(editorId: string, scriptId: string): Promise<string>;
    /** Writes the script's file and opens its tab beside the diagram. */
    openTab(target: ScriptTabTarget, script: InlineScript): Promise<void>;
    /** Shows the script's open tab and keeps what it holds. */
    revealTab(target: ScriptTabTarget, script: InlineScript): Promise<void>;
    /** Shows a script file the user opened as its script's tab; rejects when the tab cannot sync. */
    adoptTab(tabPath: string, file: MatchedScriptFile, filePath: string): Promise<void>;
    /** Writes the script's file and opens no tab; a failed write rejects. */
    writeScript(target: ScriptTabTarget, script: InlineScript): Promise<void>;
    /** Replaces what the open tab holds with the model's content. */
    updateTabContent(tabPath: string, content: string): Promise<void>;
    /** Closes the tab of a script the model removed, and deletes its file. */
    closeTab(tabPath: string): Promise<void>;
    /** The editor's process variables changed; a host whose tabs hold a copy pushes them. */
    updateTabVariables(editorId: string, tabPaths: readonly string[]): void;
    /** The editor closed: closes its tabs and deletes its script files. */
    closeEditorTabs(editorId: string, tabs: ReadonlyArray<readonly [string, OpenScriptTab]>): void;
    /** What the tab holds now, or its file once the tab closed; `undefined` when neither reads. */
    readTabContent(tabPath: string): Promise<string | undefined>;
    /** Whether a tab still shows `tabPath`. */
    isTabShown(tabPath: string): boolean;
}
