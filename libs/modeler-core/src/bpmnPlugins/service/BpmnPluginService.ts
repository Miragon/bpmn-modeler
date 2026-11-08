import { BpmnPluginAsset, BpmnPluginsQuery } from "@miragon/bpmn-modeler-shared";

import { toWorkspacePath } from "../../kernel/domain/workspacePath";
import { NotifierPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { answerWithoutPlugins } from "../../editorSession/service/answerWithoutPlugins";
import { EditorSessionStore, PostOutcome } from "../../editorSession/service/EditorSessionStore";
import { cachedPluginCopy, cachedPluginFiles, PendingApproval } from "../domain/pluginApproval";
import { editorsOfferedAnyOf } from "../domain/pluginFolders";
import { PluginApprovalQuestion } from "./PluginApprovalQuestion";
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
    /** One copy per content hash and session; a failed copy is dropped, so the next request retries it. */
    private readonly copies = new Map<string, Promise<void>>();
    private readonly offeredByEditor = new Map<string, readonly string[]>();
    private approvalSettled: Promise<void> = Promise.resolve();

    /**
     * @param cacheRoot The host's plugin cache, a folder the webview may load
     *   files from, in either path spelling (VS Code passes a Windows `fsPath`).
     */
    constructor(
        private readonly store: EditorSessionStore,
        private readonly workspace: WorkspacePort,
        private readonly catalog: PluginCatalog,
        private readonly question: PluginApprovalQuestion,
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
            this.logUnsent(editorId, await answerWithoutPlugins(this.store, editorId));
            return;
        }
        const { approved, pending } = await this.catalog.pluginsFor(handle.documentPath());
        this.offeredByEditor.set(editorId, [
            ...approved.map(({ plugin }) => plugin.id),
            ...pending.map(({ artifact }) => artifact.id),
        ]);
        const assets: BpmnPluginAsset[] = [];
        for (const discovered of approved) {
            const asset = await this.serve(discovered, webviewUrlOf);
            if (asset) {
                assets.push(asset);
            }
        }
        const outcome = await this.store.postUnlessHidden(editorId, new BpmnPluginsQuery(assets));
        if (outcome !== "sent") {
            this.logUnsent(editorId, outcome);
            return;
        }
        // Not awaited: the router runs this editor's commands in order, and a
        // question left open would hold back its document syncs.
        const asking = this.askAndReload(pending).catch((error: unknown) =>
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

    private logUnsent(editorId: string, outcome: PostOutcome): void {
        if (outcome === "hidden") {
            // Shown again, the webview restarts and asks for its plugins itself.
            this.notifier.logDebug(`BPMN plugins not sent to hidden editor: ${editorId}`);
        } else if (outcome === "undelivered") {
            this.notifier.logWarning(`BPMN plugins could not be sent to editor: ${editorId}`);
        }
    }

    /** Copies the approved bytes into the cache and returns where the webview loads them. */
    private async serve(
        discovered: DiscoveredPlugin,
        webviewUrlOf: (path: string) => string,
    ): Promise<BpmnPluginAsset | undefined> {
        const files = cachedPluginFiles(this.cacheRoot, discovered.plugin);
        try {
            await this.ensureCopied(discovered);
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

    private ensureCopied(discovered: DiscoveredPlugin): Promise<void> {
        const hash = discovered.plugin.contentHash;
        const known = this.copies.get(hash);
        if (known !== undefined) {
            return known;
        }
        const copy = this.copy(discovered);
        this.copies.set(hash, copy);
        copy.catch(() => {
            if (this.copies.get(hash) === copy) {
                this.copies.delete(hash);
            }
        });
        return copy;
    }

    /**
     * Rewrites each cached file whose bytes differ from the approved ones. A
     * write cut short, by a crash in an earlier session, leaves a file that
     * would otherwise be served as it is.
     */
    private async copy(discovered: DiscoveredPlugin): Promise<void> {
        const files = cachedPluginFiles(this.cacheRoot, discovered.plugin);
        for (const { path, content } of cachedPluginCopy(
            files,
            discovered.script,
            discovered.style,
        )) {
            if ((await this.cachedContentOf(path)) !== content) {
                await this.workspace.writeFile(path, content);
            }
        }
    }

    /** `undefined` for a copy that cannot be read, which the write then replaces. */
    private async cachedContentOf(path: string): Promise<string | undefined> {
        try {
            return await this.workspace.readFile(path);
        } catch {
            return undefined;
        }
    }

    private async askAndReload(pending: readonly PendingApproval[]): Promise<void> {
        const allowed = await this.question.ask(pending);
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
