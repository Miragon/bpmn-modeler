import { DirectoryEntryKind } from "../../kernel/domain/directoryEntry";
import { DirectoryNotFound } from "../../kernel/domain/errors";
import { joinWorkspacePath, toWorkspacePath } from "../../kernel/domain/workspacePath";
import { NotifierPort, WorkspacePort } from "../../kernel/port/hostPorts";
import {
    CachedPluginFiles,
    cachedCopyNames,
    cachedPluginCopy,
    cachedPluginDirectory,
    cachedPluginFiles,
    isWholeCachedCopy,
    lastUseMarkerOf,
    WorkspacePlugin,
} from "../domain/pluginApproval";
import {
    copiesToPrune,
    lastUseMarkerText,
    ON_REQUEST_IDLE_LIMIT_MS,
    shouldRefreshLastUse,
    START_UP_IDLE_LIMIT_MS,
} from "../domain/pluginCacheLastUse";
import { DiscoveredPlugin } from "./WorkspacePluginLocator";

/**
 * The content-addressed copies of the approved plugin bytes the webview loads.
 * A copy waits for a running prune, a prune waits for the copies and last-use
 * writes in flight, and a copy another process deleted is written again on the
 * next request.
 */
export class PluginCache {
    private readonly cacheRoot: string;
    /** One copy per content hash and session; a failed copy is dropped, so the next request retries it. */
    private readonly copies = new Map<string, Promise<void>>();
    /** When this process last wrote each copy's last use, so opening editors writes it once a day. */
    private readonly lastUseWritten = new Map<string, number>();
    /** Awaited by a prune, as the copies are. */
    private readonly lastUseWrites = new Set<Promise<void>>();
    /** Set while a prune runs, so no copy or last-use write starts until it has finished. */
    private pruning?: Promise<unknown>;

    /**
     * @param cacheRoot The host's plugin cache, a folder the webview may load
     *   files from, in either path spelling (VS Code passes a Windows `fsPath`).
     * @param contentInUse The content hashes this process's editors are served;
     *   read once a prune has listed the cache, so a request that lands meanwhile keeps its copy.
     */
    constructor(
        private readonly workspace: WorkspacePort,
        private readonly notifier: NotifierPort,
        cacheRoot: string,
        private readonly contentInUse: () => ReadonlySet<string>,
        private readonly now: () => number = Date.now,
    ) {
        this.cacheRoot = toWorkspacePath(cacheRoot);
    }

    /**
     * Copies the approved bytes into the cache, records their use and returns
     * where the copy lies. Rejects when the copy cannot be written.
     */
    async servedCopyOf(discovered: DiscoveredPlugin): Promise<CachedPluginFiles> {
        await this.ensureCopied(discovered);
        await this.recordUse(discovered.plugin);
        return cachedPluginFiles(this.cacheRoot, discovered.plugin);
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
            inUse: this.contentInUse(),
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
}
