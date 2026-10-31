import { isSafeRepoPath, MarketplaceContentType } from "../domain/marketplace";
import {
    CachedSourceSlot,
    FetchedTemplateFile,
    formatSourceSlotRecord,
    nextSourceSlotRecord,
    parseSourceSlotRecord,
    SourceSlotRecord,
} from "../domain/sourceCacheRefresh";
import { DirectoryNotFound, FileNotFound } from "../../kernel/domain/errors";
import { WorkspacePort } from "../../kernel/domain/hostPorts";

/**
 * The content-type segment the template pipeline owns. `getCachedTemplatePaths`
 * reads only this child of each source slot, so a future content type cached in
 * a sibling dir never leaks into the element-template merge.
 */
const ELEMENT_TEMPLATES_SEGMENT: MarketplaceContentType = "element-templates";

const SLOT_RECORD = "slot.json";

/**
 * Local on-disk cache of fetched template files, the bridge between a remote
 * fetch and the existing template render pipeline.
 *
 * Layout: `<cacheRoot>/<marketplaceId>/<sourceIndex>/<generation>/<contentType>/<repo-relative path>`,
 * beside `<sourceIndex>/slot.json`, the {@link SourceSlotRecord} that names the
 * slot's source and its live generation. Keying by `marketplaceId` then
 * `sourceIndex` keeps sources isolated, so two templates sharing a basename
 * never clobber each other; the `<contentType>` segment keeps a future JSON
 * content type (lint rules, palette entries) out of the element-template
 * pipeline that reads this cache. A slot without a record, cached by an earlier
 * version, holds its `<contentType>` directories itself.
 *
 * A refresh replaces, keeps or removes whole source slots (see
 * `planSourceCacheRefresh`). A marketplace removed from settings is pruned
 * wholesale via {@link prune}, which deletes every top-level slot no longer
 * registered.
 */
export class MarketplaceCache {
    /**
     * @param cacheRoot Absolute path to the `marketplaces/` directory under the
     *   host's global storage.
     */
    constructor(
        private readonly cacheRoot: string,
        private readonly workspace: WorkspacePort,
    ) {}

    async cachedSlots(marketplaceId: string): Promise<CachedSourceSlot[]> {
        const marketplaceDir = `${this.cacheRoot}/${marketplaceId}`;
        const slots: CachedSourceSlot[] = [];
        for (const sourceDir of await this.listSubdirectories(marketplaceDir)) {
            const name = sourceDir.slice(marketplaceDir.length + 1);
            if (/^\d+$/.test(name)) {
                const record = await this.readSlotRecord(sourceDir);
                slots.push({ sourceIndex: Number(name), source: record?.source });
            }
        }
        return slots;
    }

    /**
     * Swaps the slot's files for `files` and records `source` as their owner;
     * each `repoPath` is reproduced verbatim under its content type so distinct
     * upstream files stay distinct on disk. The files go into a new generation
     * that the record names only once every write succeeded, so a failed write
     * keeps the slot's previous files.
     *
     * @throws {Error} when a `repoPath` is absolute or contains a `..` segment,
     *   before anything is written. A self-hosted `baseUrl` is untrusted
     *   user-configured infrastructure and can return a hostile path (e.g.
     *   `../../../settings.json`); without this guard the concatenation would
     *   write attacker content outside the cache root.
     */
    async replaceSource(
        marketplaceId: string,
        sourceIndex: number,
        source: string,
        files: readonly FetchedTemplateFile[],
    ): Promise<void> {
        for (const { repoPath } of files) {
            if (!isSafeRepoPath(repoPath)) {
                throw new Error(`Rejected unsafe template path "${repoPath}"`);
            }
        }
        const sourceDir = this.sourceDir(marketplaceId, sourceIndex);
        const record = nextSourceSlotRecord(await this.readSlotRecord(sourceDir), source);
        const generationDir = `${sourceDir}/${record.generation}`;
        // A replace that failed before its record was written left this generation behind.
        await this.workspace.deleteDirectory(generationDir);
        for (const { contentType, repoPath, content } of files) {
            await this.workspace.writeFile(`${generationDir}/${contentType}/${repoPath}`, content);
        }
        await this.workspace.writeFile(
            `${sourceDir}/${SLOT_RECORD}`,
            formatSourceSlotRecord(record),
        );
        for (const directory of await this.listSubdirectories(sourceDir)) {
            if (directory !== generationDir) {
                await this.workspace.deleteDirectory(directory);
            }
        }
    }

    async removeSource(marketplaceId: string, sourceIndex: number): Promise<void> {
        await this.workspace.deleteDirectory(this.sourceDir(marketplaceId, sourceIndex));
    }

    private sourceDir(marketplaceId: string, sourceIndex: number): string {
        return `${this.cacheRoot}/${marketplaceId}/${sourceIndex}`;
    }

    /**
     * The merge input for the template pipeline; `[]` before anything is cached.
     * The scan is scoped to each source's `element-templates` segment, so
     * old-layout leftovers and foreign content types are excluded by
     * construction rather than filtered out afterwards.
     */
    async getCachedTemplatePaths(): Promise<string[]> {
        const paths: string[] = [];
        for (const marketplaceDir of await this.listSubdirectories(this.cacheRoot)) {
            for (const sourceDir of await this.listSubdirectories(marketplaceDir)) {
                const filesDir = await this.liveFilesDir(sourceDir);
                paths.push(
                    ...(await this.listJsonRecursive(`${filesDir}/${ELEMENT_TEMPLATES_SEGMENT}`)),
                );
            }
        }
        return paths;
    }

    private async liveFilesDir(sourceDir: string): Promise<string> {
        const record = await this.readSlotRecord(sourceDir);
        return record === undefined ? sourceDir : `${sourceDir}/${record.generation}`;
    }

    private async readSlotRecord(sourceDir: string): Promise<SourceSlotRecord | undefined> {
        try {
            return parseSourceSlotRecord(
                await this.workspace.readFile(`${sourceDir}/${SLOT_RECORD}`),
            );
        } catch (error) {
            if (error instanceof FileNotFound) {
                return undefined;
            }
            throw error;
        }
    }

    /**
     * Deletes every top-level marketplace slot whose id is not in
     * `registeredIds`, so removing a marketplace from settings also removes the
     * templates it orphaned. A slot's directory name *is* its `marketplaceId`
     * (that is how {@link replaceSource} keys the layout), so the set membership
     * check is exact. A missing cache root maps to `[]` (nothing cached yet).
     *
     * @returns the ids of the slots actually deleted, for the caller to log.
     */
    async prune(registeredIds: ReadonlySet<string>): Promise<string[]> {
        const pruned: string[] = [];
        for (const marketplaceDir of await this.listSubdirectories(this.cacheRoot)) {
            // `listSubdirectories` returns `<cacheRoot>/<name>`; the name after the
            // root prefix is the marketplaceId the slot was written under.
            const id = marketplaceDir.slice(this.cacheRoot.length + 1);
            if (!registeredIds.has(id)) {
                await this.workspace.deleteDirectory(marketplaceDir);
                pruned.push(id);
            }
        }
        return pruned;
    }

    /**
     * The immediate child directories of `folder`, or `[]` when the folder does
     * not exist yet (nothing cached) — the same expected-empty mapping the
     * recursive scan uses.
     */
    private async listSubdirectories(folder: string): Promise<string[]> {
        let entries: [string, "file" | "directory"][];
        try {
            entries = await this.workspace.readDirectory(folder);
        } catch (error) {
            if (error instanceof DirectoryNotFound) {
                return [];
            }
            throw error;
        }
        return entries
            .filter(([, type]) => type === "directory")
            .map(([name]) => `${folder}/${name}`);
    }

    /**
     * A missing directory is an expected empty result (nothing cached yet), not
     * an error, so it maps to `[]`.
     */
    private async listJsonRecursive(folder: string): Promise<string[]> {
        let entries: [string, "file" | "directory"][];
        try {
            entries = await this.workspace.readDirectory(folder);
        } catch (error) {
            if (error instanceof DirectoryNotFound) {
                return [];
            }
            throw error;
        }

        const files: string[] = [];
        for (const [name, type] of entries) {
            if (type === "directory") {
                files.push(...(await this.listJsonRecursive(`${folder}/${name}`)));
            } else if (type === "file" && name.endsWith(".json")) {
                files.push(`${folder}/${name}`);
            }
        }
        return files;
    }
}
