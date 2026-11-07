import { BpmnPluginAsset, BpmnPluginsQuery } from "@miragon/bpmn-modeler-shared";

import { DirectoryNotFound } from "../../kernel/domain/errors";
import { toWorkspacePath } from "../../kernel/domain/workspacePath";
import {
    ActionNotifierPort,
    NotifierPort,
    PickerPort,
    WorkspacePort,
} from "../../kernel/port/hostPorts";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import {
    CachedPluginFiles,
    cachedPluginFiles,
    holdsCachedPluginFiles,
    PendingApproval,
} from "../domain/pluginApproval";
import { editorsOfferedAnyOf } from "../domain/pluginFolders";
import { PluginCatalog } from "./PluginCatalog";
import { DiscoveredPlugin } from "./WorkspacePluginLocator";

/**
 * Answers a BPMN editor's plugin request with the approved plugins and asks
 * about the others afterwards, so the editor never waits on the user. An
 * approval reloads every open editor that was offered an allowed plugin,
 * because modules are fixed once a modeler is built.
 */
export class BpmnPluginService {
    private readonly cacheRoot: string;
    /** The content hashes whose copy is complete in the cache. */
    private readonly cachedHashes = new Set<string>();
    private readonly offeredByEditor = new Map<string, readonly string[]>();
    private approvalQuestion: Promise<void> | undefined;
    private approvalSettled: Promise<void> = Promise.resolve();

    /**
     * @param cacheRoot The host's plugin cache, a folder the webview may load
     *   files from, in either path spelling (VS Code passes a Windows `fsPath`).
     */
    constructor(
        private readonly store: EditorSessionStore,
        private readonly workspace: WorkspacePort,
        private readonly catalog: PluginCatalog,
        private readonly picker: PickerPort,
        private readonly actionNotifier: ActionNotifierPort,
        private readonly notifier: NotifierPort,
        cacheRoot: string,
    ) {
        this.cacheRoot = toWorkspacePath(cacheRoot);
    }

    async answerPluginRequest(editorId: string): Promise<void> {
        const handle = this.store.requireHandle(editorId);
        const webviewUrlOf = handle.webviewUrlOf?.bind(handle);
        if (webviewUrlOf === undefined) {
            this.notifier.logDebug("BPMN plugins: this host's webview cannot load plugin files.");
            await this.store.postUnlessHidden(editorId, new BpmnPluginsQuery([]));
            return;
        }
        const { approved, pending } = await this.catalog.pluginsFor(handle.documentPath());
        this.offeredByEditor.set(editorId, [
            ...approved.map(({ plugin }) => plugin.id),
            ...pending.map(({ plugin }) => plugin.id),
        ]);
        const assets: BpmnPluginAsset[] = [];
        for (const discovered of approved) {
            const asset = await this.serve(discovered, webviewUrlOf);
            if (asset) {
                assets.push(asset);
            }
        }
        const outcome = await this.store.postUnlessHidden(editorId, new BpmnPluginsQuery(assets));
        if (outcome === "hidden") {
            // Shown again, the webview restarts and asks for its plugins itself.
            this.notifier.logDebug(`BPMN plugins not sent to hidden editor: ${editorId}`);
            return;
        }
        if (outcome === "undelivered") {
            this.notifier.logWarning(`BPMN plugins could not be sent to editor: ${editorId}`);
            return;
        }
        // Not awaited: the router runs this editor's commands in order, and a
        // question left open would hold back its document syncs.
        const asking = this.askForApprovals(pending).catch((error: unknown) =>
            this.notifier.logError(error instanceof Error ? error : new Error(String(error))),
        );
        this.approvalSettled = Promise.all([this.approvalSettled, asking]).then(() => undefined);
    }

    releaseEditor(editorId: string): void {
        this.offeredByEditor.delete(editorId);
    }

    /** Resolves once every approval question raised so far is answered. */
    whenApprovalSettled(): Promise<void> {
        return this.approvalSettled;
    }

    /** Copies the approved bytes into the cache once and returns where the webview loads them. */
    private async serve(
        discovered: DiscoveredPlugin,
        webviewUrlOf: (path: string) => string,
    ): Promise<BpmnPluginAsset | undefined> {
        const files = cachedPluginFiles(this.cacheRoot, discovered.plugin);
        try {
            await this.ensureCached(discovered, files);
        } catch (error) {
            this.notifier.logWarning(
                `BPMN plugin "${discovered.plugin.name}" left out: its copy could not be written (${String(error)})`,
            );
            return undefined;
        }
        return {
            name: discovered.plugin.name,
            scriptUrl: webviewUrlOf(files.script),
            ...(files.style === undefined ? {} : { styleUrl: webviewUrlOf(files.style) }),
        };
    }

    private async ensureCached(
        discovered: DiscoveredPlugin,
        files: CachedPluginFiles,
    ): Promise<void> {
        const hash = discovered.plugin.contentHash;
        if (this.cachedHashes.has(hash)) {
            return;
        }
        if (!(await this.holdsCopy(files))) {
            if (files.style !== undefined && discovered.style !== undefined) {
                await this.workspace.writeFile(files.style, discovered.style);
            }
            // Written last: an interrupted copy then lacks its script.
            await this.workspace.writeFile(files.script, discovered.script);
        }
        this.cachedHashes.add(hash);
    }

    /** A copy an earlier session wrote, so a new session lists it instead of rewriting it. */
    private async holdsCopy(files: CachedPluginFiles): Promise<boolean> {
        try {
            return holdsCachedPluginFiles(
                await this.workspace.readDirectory(files.directory),
                files,
            );
        } catch (error) {
            if (error instanceof DirectoryNotFound) {
                return false;
            }
            throw error;
        }
    }

    private async askForApprovals(found: readonly PendingApproval[]): Promise<void> {
        // A second editor opening while the question is open would ask the same again.
        if (this.approvalQuestion !== undefined) {
            return;
        }
        const pending = this.catalog.stillPendingOf(found);
        if (pending.length === 0) {
            return;
        }
        this.approvalQuestion = this.ask(pending);
        try {
            await this.approvalQuestion;
        } finally {
            this.approvalQuestion = undefined;
        }
    }

    private async ask(pending: readonly PendingApproval[]): Promise<void> {
        const action = await this.actionNotifier.offer(this.catalog.reviewNotice(pending));
        const checked =
            action === "review"
                ? await this.picker.chooseMany(
                      this.catalog.reviewPrompt(pending, this.workspace.getWorkspaceFolderPaths()),
                  )
                : [];
        const allowed = await this.catalog.applyAnswer(pending, checked);
        const allowedIds = allowed.map((plugin) => plugin.id);
        for (const editorId of editorsOfferedAnyOf(this.offeredByEditor, allowedIds)) {
            this.reload(editorId);
        }
    }

    private reload(editorId: string): void {
        if (!this.store.hasEditor(editorId)) {
            return;
        }
        try {
            this.store.reload(editorId);
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
