import {
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
} from "@miragon/bpmn-modeler-shared";

import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { LoggerPort } from "../../kernel/port/hostPorts";
import { InlineScript, ScriptSourceChange } from "../domain/inlineScript";
import { OpenScriptTabs } from "../domain/OpenScriptTabs";
import { ScriptMaterialization } from "../domain/scriptBatchSummary";
import { matchScriptFile } from "../domain/scriptFileMatching";
import { ScriptEditorPort, ScriptTabListener, ScriptTabTarget } from "../port/ScriptEditorPort";
import { ScriptContentStream } from "./ScriptContentStream";
import { ScriptFileStore } from "./ScriptFileStore";
import { ScriptTargetResolver } from "./ScriptTargetResolver";

export interface ScriptTabServiceOptions {
    /** The host's webview still takes messages while its editor closes, so the edit waiting to stream is sent. */
    readonly flushEditsOnEditorClose?: boolean;
}

/**
 * Keeps the host's inline-script tabs in step with the model: which scripts
 * have a tab, the open-script list the webview locks, the edits each tab
 * streams into the model, a model change or removal reaching the tab, and the
 * edits a hidden webview missed, replayed on its reload. The host only writes
 * files and shows tabs, behind {@link ScriptEditorPort}.
 */
export class ScriptTabService implements ScriptTabListener {
    private readonly tabs = new OpenScriptTabs();
    private readonly contentStream: ScriptContentStream;

    /** Editors whose hidden webview missed an edit; their reload replays every tab. */
    private readonly missedEdits = new Set<string>();

    constructor(
        private readonly store: EditorSessionStore,
        private readonly scriptEditor: ScriptEditorPort,
        private readonly targets: ScriptTargetResolver,
        private readonly scriptFiles: ScriptFileStore,
        private readonly logger: LoggerPort,
        private readonly options: ScriptTabServiceOptions = {},
    ) {
        this.contentStream = new ScriptContentStream(store, logger, (editorId) =>
            this.missedEdits.add(editorId),
        );
        scriptEditor.listen(this);
    }

    /** Opens the script's tab, or reveals the open one; asks for a language the model lacks. */
    async open(editorId: string, script: InlineScript): Promise<void> {
        const target = await this.targetOf(editorId, script);
        if (!target) {
            return;
        }
        if (this.tabs.isOpen(target.tabPath)) {
            await this.scriptEditor.revealTab(target, script);
            return;
        }
        const { elementId, kind, listenerIndex } = script;
        // Tracked before the host shows the tab, so the host's report of that tab is no user open.
        this.tabs.track(target.tabPath, { editorId, elementId, kind, listenerIndex });
        try {
            await this.scriptEditor.openTab(target, script);
        } catch (error) {
            this.tabs.untrack(target.tabPath);
            throw error;
        }
        this.broadcastOpenScripts(editorId);
    }

    /** Writes the script's file without a tab, unless an open tab owns it; a failed write rejects. */
    async materialize(editorId: string, script: InlineScript): Promise<ScriptMaterialization> {
        const target = await this.targetOf(editorId, script);
        if (!target) {
            return { kind: "cancelled" };
        }
        const plan = this.tabs.materializationOf(target.tabPath);
        if (plan.kind === "alreadyOpen") {
            return plan;
        }
        await this.scriptEditor.writeScript(target, script);
        return { kind: "written" };
    }

    /** The model side wins: a changed script replaces what its tab holds, a removed one closes it. */
    async applyModelChange(editorId: string, change: ScriptSourceChange): Promise<void> {
        const found = this.tabs.find(editorId, change);
        if (!found) {
            return;
        }
        const [tabPath] = found;
        if (change.content === undefined) {
            this.contentStream.stop(tabPath);
            this.tabs.untrack(tabPath);
            this.broadcastOpenScripts(editorId);
            await this.scriptEditor.closeTab(tabPath);
            return;
        }
        this.contentStream.cancel(tabPath);
        await this.scriptEditor.updateTabContent(tabPath, change.content);
    }

    /** The editor's webview (re)loaded: replays the edits it missed and locks its open scripts again. */
    async resync(editorId: string): Promise<void> {
        await this.replayMissedEdits(editorId);
        this.broadcastOpenScripts(editorId);
    }

    variablesChanged(editorId: string): void {
        const tabPaths = this.tabs.ofEditor(editorId).map(([tabPath]) => tabPath);
        this.scriptEditor.updateTabVariables(editorId, tabPaths);
    }

    /** The editor closed: forgets its tabs and has the host close them. */
    disposeEditor(editorId: string): void {
        const closing = this.tabs.ofEditor(editorId);
        for (const [tabPath] of closing) {
            this.tabs.untrack(tabPath);
            if (this.options.flushEditsOnEditorClose) {
                void this.contentStream.flush(tabPath);
            }
            this.contentStream.stop(tabPath);
        }
        this.missedEdits.delete(editorId);
        this.scriptEditor.closeEditorTabs(editorId, closing);
    }

    /** The editor whose script the tab at `tabPath` shows; `undefined` for a file that is no tracked script. */
    editorOfTab(tabPath: string): string | undefined {
        return this.tabs.get(tabPath)?.editorId;
    }

    didChange(tabPath: string, content: string): void {
        const tab = this.tabs.get(tabPath);
        if (tab) {
            this.contentStream.push(tabPath, tab, content);
        }
    }

    async didClose(tabPath: string): Promise<void> {
        const tab = this.tabs.get(tabPath);
        if (!tab) {
            return;
        }
        await this.contentStream.flush(tabPath);
        // The flush may have found the webview hidden; the reload replays the tab, then forgets it.
        if (this.missedEdits.has(tab.editorId)) {
            return;
        }
        this.release(tabPath);
    }

    /**
     * A script file the user opened from its editor's script folder starts
     * syncing; no content moves until the first edit, which streams the whole
     * tab.
     */
    async didOpenFile(filePath: string): Promise<void> {
        // A host that tracks a tab under its file's path also reports the tabs
        // it opens itself; checked before any await, as the tab may close meanwhile.
        if (this.tabs.isOpen(filePath)) {
            return;
        }
        const match = matchScriptFile(filePath, this.store.getEditorIds());
        if (!match || !(await this.scriptFiles.adopt(match.editorId, filePath))) {
            return;
        }
        const tabPath = await this.scriptEditor.tabPathOf(match.editorId, match.scriptId);
        if (this.tabs.isOpen(tabPath)) {
            return;
        }
        const { editorId, elementId, kind, listenerIndex } = match;
        this.tabs.track(tabPath, { editorId, elementId, kind, listenerIndex });
        try {
            await this.scriptEditor.adoptTab(tabPath, match, filePath);
        } catch (error) {
            this.tabs.untrack(tabPath);
            this.logger.logError(error as Error);
            return;
        }
        this.broadcastOpenScripts(editorId);
    }

    private async targetOf(
        editorId: string,
        script: InlineScript,
    ): Promise<ScriptTabTarget | undefined> {
        const resolved = await this.targets.resolve(editorId, script);
        if (!resolved) {
            return undefined;
        }
        const tabPath = await this.scriptEditor.tabPathOf(editorId, resolved.uri.toString());
        return { tabPath, editorId, uri: resolved.uri, language: resolved.language };
    }

    private async replayMissedEdits(editorId: string): Promise<void> {
        if (!this.missedEdits.delete(editorId)) {
            return;
        }
        const closedMeanwhile: string[] = [];
        for (const [tabPath, tab] of this.tabs.ofEditor(editorId)) {
            // Each pass awaits, so a later tab may have closed meanwhile.
            if (this.tabs.get(tabPath) !== tab) {
                continue;
            }
            const content = await this.scriptEditor.readTabContent(tabPath);
            if (content === undefined) {
                continue;
            }
            try {
                const outcome = await this.store.postUnlessHidden(
                    editorId,
                    new UpdateScriptContentQuery(
                        tab.elementId,
                        tab.kind,
                        tab.listenerIndex,
                        content,
                    ),
                );
                if (outcome === "hidden") {
                    this.missedEdits.add(editorId);
                    continue;
                }
                // The replay carried the whole tab, so its waiting edit would only repeat it.
                this.contentStream.cancel(tabPath);
                if (!this.scriptEditor.isTabShown(tabPath)) {
                    closedMeanwhile.push(tabPath);
                }
            } catch (error) {
                this.logger.logError(error as Error);
            }
        }
        for (const tabPath of closedMeanwhile) {
            this.release(tabPath);
        }
    }

    private release(tabPath: string): void {
        const editorId = this.tabs.untrack(tabPath)?.editorId;
        this.contentStream.stop(tabPath);
        if (editorId !== undefined) {
            this.broadcastOpenScripts(editorId);
        }
    }

    /** A hidden webview misses the list; its reload asks for it again. */
    private broadcastOpenScripts(editorId: string): void {
        this.store
            .postUnlessHidden(
                editorId,
                new UpdateOpenScriptEditorsQuery(this.tabs.openScriptsOf(editorId)),
            )
            .catch((error: unknown) => {
                this.logger.logError(error instanceof Error ? error : new Error(String(error)));
            });
    }
}
