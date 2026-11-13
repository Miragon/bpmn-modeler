import { InlineScript } from "../scriptTask/domain/inlineScript";
import { OpenScriptTab } from "../scriptTask/domain/OpenScriptTabs";
import { MatchedScriptFile } from "../scriptTask/domain/scriptFileMatching";
import {
    ScriptEditorPort,
    ScriptTabListener,
    ScriptTabTarget,
} from "../scriptTask/port/ScriptEditorPort";
import { ScriptFileStore } from "../scriptTask/service/ScriptFileStore";

export interface ScriptEditorCall<TScript> {
    readonly editorId: string;
    readonly script: TScript;
}

export interface TabContentUpdate {
    readonly tabPath: string;
    readonly content: string;
}

/**
 * A host's script tabs in memory: holds what was opened, revealed, written,
 * updated and closed, and keeps the `ScriptEditorPort` contract
 * (`describeScriptEditorContract`). Each tab is tracked under its file's path,
 * which it writes through `scriptFiles`. A spec plays the user with
 * `openFileByUser`, `closeTabByUser` and `typeByUser`, and steers it only to inject a
 * failure or a hang: `writeInterruptions` fails or holds the next writes in
 * order (an `Error` rejects that write; a `Promise` holds it until it settles,
 * then the write goes on), and `openFailure` and `adoptFailure` reject
 * `openTab` and `adoptTab` while set.
 */
export class RecordingScriptEditor implements ScriptEditorPort {
    readonly opened: ScriptEditorCall<InlineScript>[] = [];
    readonly revealed: string[] = [];
    readonly adopted: string[] = [];
    readonly written: ScriptEditorCall<InlineScript>[] = [];
    readonly contentUpdates: TabContentUpdate[] = [];
    readonly closedTabs: string[] = [];
    readonly variablePushes: ScriptEditorCall<readonly string[]>[] = [];
    readonly closedEditors: string[] = [];
    readonly writeInterruptions: (Error | Promise<void>)[] = [];
    openFailure: Error | undefined;
    adoptFailure: Error | undefined;

    /** What each shown tab holds, by its path. */
    private readonly shownTabs = new Map<string, string>();
    private listener: ScriptTabListener | undefined;

    constructor(private readonly scriptFiles: ScriptFileStore) {}

    listen(listener: ScriptTabListener): void {
        this.listener = listener;
    }

    tabPathOf(editorId: string, scriptId: string): Promise<string> {
        return this.scriptFiles.pathOf(editorId, scriptId);
    }

    async openTab(target: ScriptTabTarget, script: InlineScript): Promise<void> {
        this.opened.push({ editorId: target.editorId, script: inlineScriptOf(script) });
        if (this.openFailure) throw this.openFailure;
        await this.write(target, script);
        this.shownTabs.set(target.tabPath, script.content);
    }

    async revealTab(target: ScriptTabTarget): Promise<void> {
        this.revealed.push(target.tabPath);
    }

    async adoptTab(tabPath: string, _file: MatchedScriptFile, filePath: string): Promise<void> {
        this.adopted.push(tabPath);
        if (this.adoptFailure) throw this.adoptFailure;
        this.shownTabs.set(tabPath, await this.scriptFiles.readFile(filePath));
    }

    async writeScript(target: ScriptTabTarget, script: InlineScript): Promise<void> {
        this.written.push({ editorId: target.editorId, script: inlineScriptOf(script) });
        const interruption = this.writeInterruptions.shift();
        if (interruption instanceof Error) throw interruption;
        await interruption;
        await this.write(target, script);
    }

    async updateTabContent(tabPath: string, content: string): Promise<void> {
        this.contentUpdates.push({ tabPath, content });
        this.shownTabs.set(tabPath, content);
    }

    async closeTab(tabPath: string): Promise<void> {
        this.closedTabs.push(tabPath);
        this.shownTabs.delete(tabPath);
        await this.scriptFiles.deleteScript(tabPath);
    }

    updateTabVariables(editorId: string, tabPaths: readonly string[]): void {
        this.variablePushes.push({ editorId, script: tabPaths });
    }

    closeEditorTabs(editorId: string, tabs: ReadonlyArray<readonly [string, OpenScriptTab]>): void {
        this.closedEditors.push(editorId);
        for (const [tabPath] of tabs) this.shownTabs.delete(tabPath);
        const editorScriptDir = this.scriptFiles.releaseEditor(editorId);
        if (editorScriptDir !== undefined) void this.scriptFiles.deleteFolder(editorScriptDir);
    }

    async readTabContent(tabPath: string): Promise<string | undefined> {
        const shown = this.shownTabs.get(tabPath);
        if (shown !== undefined) return shown;
        return this.scriptFiles.readFile(tabPath).catch(() => undefined);
    }

    isTabShown(tabPath: string): boolean {
        return this.shownTabs.has(tabPath);
    }

    /** The user opened the file at `filePath` outside the modeler. */
    async openFileByUser(filePath: string): Promise<void> {
        await this.listener?.didOpenFile(filePath);
    }

    /** The user closed the tab of the file at `filePath`, which saves what it holds. */
    async closeTabByUser(filePath: string): Promise<void> {
        const content = this.shownTabs.get(filePath);
        this.shownTabs.delete(filePath);
        if (content !== undefined) await this.scriptFiles.writeFile(filePath, content);
        await this.listener?.didClose(filePath);
    }

    /** The user typed `content` into the tab at `tabPath`. */
    typeByUser(tabPath: string, content: string): void {
        this.shownTabs.set(tabPath, content);
        this.listener?.didChange(tabPath, content);
    }

    private async write(target: ScriptTabTarget, script: InlineScript): Promise<void> {
        const filePath = await this.scriptFiles.prepareScriptFile(target.editorId, target.uri);
        await this.scriptFiles.writeFile(filePath, script.content);
    }
}

/** Only the script's own fields, so a recorded webview command compares like a plain script. */
function inlineScriptOf(script: InlineScript): InlineScript {
    const { elementId, kind, listenerIndex, eventName, scriptFormat, content } = script;
    return { elementId, kind, listenerIndex, eventName, scriptFormat, content };
}
