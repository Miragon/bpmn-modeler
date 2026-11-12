import { BpmnPluginAsset, BpmnPluginsQuery } from "@miragon/bpmn-modeler-shared";

import { DirectoryEntryKind } from "../../kernel/domain/directoryEntry";
import { DirectoryNotFound } from "../../kernel/domain/errors";
import { joinWorkspacePath, toWorkspacePath } from "../../kernel/domain/workspacePath";
import { NotifierPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { ApprovalQuestion } from "../../kernel/service/ApprovalQuestion";
import { answerWithoutPlugins } from "../../editorSession/service/answerWithoutPlugins";
import { EditorSessionStore, PostOutcome } from "../../editorSession/service/EditorSessionStore";
import {
    cachedCopyNames,
    cachedPluginCopy,
    cachedPluginDirectory,
    cachedPluginFiles,
    contentServedByEditors,
    editorsToReload,
    isWholeCachedCopy,
    lastUseMarkerOf,
    OfferedPlugins,
    withheldByEditors,
    WorkspacePlugin,
} from "../domain/pluginApproval";
import {
    copiesToPrune,
    lastUseMarkerText,
    ON_REQUEST_IDLE_LIMIT_MS,
    shouldRefreshLastUse,
    START_UP_IDLE_LIMIT_MS,
} from "../domain/pluginCacheLastUse";
import { CodeApproval } from "../../kernel/domain/codeApproval";
import { PluginCatalog } from "./PluginCatalog";
import { DiscoveredPlugin } from "./WorkspacePluginLocator";

/**
 * Answers a BPMN editor's plugin request with the approved plugins and asks
 * about the others afterwards, so the editor never waits on the user. Any
 * change of the approvals or of the workspace's trust, whoever made it,
 * reloads every open editor whose plugins it changes, because modules are
 * fixed once a modeler is built.
 */
export class BpmnPluginService {
    private readonly cacheRoot: string;
    /** One copy per content hash and session; a failed copy is dropped, so the next request retries it. */
    private readonly copies = new Map<string, Promise<void>>();
    /** When this process last wrote each copy's last use, so opening editors writes it once a day. */
    private readonly lastUseWritten = new Map<string, number>();
    /** Awaited by a prune, as the copies are. */
    private readonly lastUseWrites = new Set<Promise<void>>();
    /** Dropped on a reload until the editor asks again, so one change reloads it once. */
    private readonly offeredByEditor = new Map<string, OfferedPlugins>();
    private approvalSettled: Promise<void> = Promise.resolve();
    /** Set while a prune runs, so no copy or last-use write starts until it has finished. */
    private pruning?: Promise<unknown>;

    /**
     * @param cacheRoot The host's plugin cache, a folder the webview may load
     *   files from, in either path spelling (VS Code passes a Windows `fsPath`).
     */
    constructor(
        private readonly store: EditorSessionStore,
        private readonly workspace: WorkspacePort,
        private readonly catalog: PluginCatalog,
        private readonly question: ApprovalQuestion<
            WorkspacePlugin,
            WorkspacePlugin,
            WorkspacePlugin
        >,
        private readonly notifier: NotifierPort,
        cacheRoot: string,
        private readonly now: () => number = Date.now,
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
        const { approved, pending, withheld } = await this.catalog.pluginsFor(
            handle.documentPath(),
        );
        this.offeredByEditor.set(editorId, {
            served: approved.map(({ plugin }) => plugin),
            withheld,
        });
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
        this.askAbout(pending);
    }

    /** At start-up: the copies no editor of any process was served for weeks. */
    pruneIdleCopies(): Promise<{ readonly removed: number }> {
        return this.prune(START_UP_IDLE_LIMIT_MS);
    }

    /** Another process that still serves a removed copy writes it again on its next request. */
    pruneUnusedCopies(): Promise<{ readonly removed: number }> {
        return this.prune(ON_REQUEST_IDLE_LIMIT_MS);
    }

    private prune(maxIdleMs: number): Promise<{ readonly removed: number }> {
        const pruning = (this.pruning ?? Promise.resolve())
            .catch(() => undefined)
            .then(() => this.removeIdleCopies(maxIdleMs));
        this.pruning = pruning;
        const done = () => {
            if (this.pruning === pruning) this.pruning = undefined;
        };
        pruning.then(done, done);
        return pruning;
    }

    releaseEditor(editorId: string): void {
        this.offeredByEditor.delete(editorId);
    }

    /** After a change of the approvals or of the workspace's trust, whoever made it. */
    runnablePluginsChanged(approvals: readonly CodeApproval[], trusted: boolean): void {
        for (const editorId of editorsToReload(this.offeredByEditor, approvals, trusted)) {
            this.offeredByEditor.delete(editorId);
            this.reload(editorId);
        }
    }

    /**
     * After a change of the workspace's trust. An editor that asked while the
     * workspace was untrusted was asked nothing, so a grant asks about what the
     * editors it does not reload withhold; a reloaded one asks on its request.
     */
    trustChanged(approvals: readonly CodeApproval[], trusted: boolean): void {
        this.runnablePluginsChanged(approvals, trusted);
        // Asked while untrusted, the request did not wait for the start-up migration.
        this.askAbout(withheldByEditors(this.offeredByEditor), this.catalog.whenRowsSettled());
    }

    /** Resolves once every approval question raised so far is answered. */
    whenApprovalSettled(): Promise<void> {
        return this.approvalSettled;
    }

    private askAbout(found: readonly WorkspacePlugin[], after = Promise.resolve()): void {
        const asking = after
            .then(() => this.question.ask(found))
            .catch((error: unknown) =>
                this.notifier.logError(error instanceof Error ? error : new Error(String(error))),
            );
        this.approvalSettled = Promise.all([this.approvalSettled, asking]).then(() => undefined);
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
        await this.recordUse(discovered.plugin);
        return {
            name: discovered.plugin.name,
            scriptUrl: webviewUrlOf(files.script),
            ...(files.style === undefined ? {} : { styleUrl: webviewUrlOf(files.style) }),
        };
    }

    /** Waits for the copies and last-use writes in flight, so it never removes a copy half written. */
    private async removeIdleCopies(maxIdleMs: number): Promise<{ readonly removed: number }> {
        await Promise.allSettled([...this.copies.values(), ...this.lastUseWrites]);
        const copies = cachedCopyNames(await this.cacheEntries());
        const markerTextByCopy = new Map<string, string>();
        for (const copy of copies) {
            const text = await this.cachedContentOf(lastUseMarkerOf(this.cacheRoot, copy));
            if (text !== undefined) markerTextByCopy.set(copy, text);
        }
        const idle = copiesToPrune(copies, {
            markerTextByCopy,
            inUse: contentServedByEditors(this.offeredByEditor),
            nowMs: this.now(),
            maxIdleMs,
        });
        let removed = 0;
        for (const name of idle) {
            const directory = joinWorkspacePath(this.cacheRoot, name);
            try {
                await this.workspace.deleteDirectory(directory);
                this.copies.delete(name);
                removed++;
            } catch (error) {
                this.notifier.logWarning(
                    `BPMN plugin cache: could not remove ${directory} (${String(error)})`,
                );
            }
        }
        return { removed };
    }

    private async cacheEntries(): Promise<[string, DirectoryEntryKind][]> {
        try {
            return await this.workspace.readDirectory(this.cacheRoot);
        } catch (error) {
            if (error instanceof DirectoryNotFound) return [];
            throw error;
        }
    }

    private async ensureCopied(discovered: DiscoveredPlugin): Promise<void> {
        const hash = discovered.plugin.contentHash;
        await this.noPruneRunning();
        const known = this.copies.get(hash);
        if (known !== undefined) {
            await known;
            if (await this.isCopyWhole(discovered.plugin)) {
                return;
            }
            if (this.copies.get(hash) === known) {
                this.copies.delete(hash);
            }
            await this.noPruneRunning();
        }
        return this.copies.get(hash) ?? this.startCopy(discovered);
    }

    /** A prune awaits only the copies already in flight when it starts, so a copy must not start under one. */
    private async noPruneRunning(): Promise<void> {
        while (this.pruning !== undefined) {
            await this.pruning.catch(() => undefined);
        }
    }

    private startCopy(discovered: DiscoveredPlugin): Promise<void> {
        const hash = discovered.plugin.contentHash;
        const copy = this.copy(discovered);
        this.copies.set(hash, copy);
        copy.catch(() => {
            if (this.copies.get(hash) === copy) {
                this.copies.delete(hash);
            }
        });
        return copy;
    }

    private async isCopyWhole(plugin: WorkspacePlugin): Promise<boolean> {
        try {
            const directory = cachedPluginDirectory(this.cacheRoot, plugin);
            return isWholeCachedCopy(plugin, await this.workspace.readDirectory(directory));
        } catch {
            return false;
        }
    }

    /**
     * Rewrites each cached file whose bytes differ from the approved ones. A
     * write cut short, by a crash in an earlier session, leaves a file that
     * would otherwise be served as it is.
     */
    private async copy(discovered: DiscoveredPlugin): Promise<void> {
        const files = cachedPluginFiles(this.cacheRoot, discovered.plugin);
        const nowMs = this.now();
        for (const { path, content } of cachedPluginCopy(
            files,
            discovered.script,
            discovered.style,
            nowMs,
        )) {
            if ((await this.cachedContentOf(path)) !== content) {
                await this.workspace.writeFile(path, content);
            }
        }
        this.lastUseWritten.set(discovered.plugin.contentHash, nowMs);
    }

    /** Never rejects: a copy whose use goes unrecorded is still served, and ages out at worst. */
    private async recordUse(plugin: WorkspacePlugin): Promise<void> {
        const hash = plugin.contentHash;
        await this.noPruneRunning();
        const nowMs = this.now();
        // A prune here removed the copy; a marker alone would make an empty folder look used.
        if (!this.copies.has(hash) || !shouldRefreshLastUse(this.lastUseWritten.get(hash), nowMs)) {
            return;
        }
        this.lastUseWritten.set(hash, nowMs);
        const write = this.workspace.writeFile(
            cachedPluginFiles(this.cacheRoot, plugin).lastUse,
            lastUseMarkerText(nowMs),
        );
        this.lastUseWrites.add(write);
        try {
            await write;
        } catch (error) {
            this.lastUseWritten.delete(hash);
            this.notifier.logWarning(
                `BPMN plugin cache: could not record the use of ${cachedPluginDirectory(this.cacheRoot, plugin)} (${String(error)})`,
            );
        } finally {
            this.lastUseWrites.delete(write);
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
