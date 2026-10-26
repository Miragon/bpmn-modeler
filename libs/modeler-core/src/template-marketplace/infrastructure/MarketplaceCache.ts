import { MarketplaceContentType } from "../domain/marketplace";
import { FetchedTemplateFile } from "../domain/sourceCacheRefresh";
import { DirectoryNotFound } from "../../shared/domain/errors";
import { WorkspacePort } from "../../shared/domain/hostPorts";

/**
 * The content-type segment the template pipeline owns. `getCachedTemplatePaths`
 * reads only this child of each source slot, so a future content type cached in
 * a sibling dir never leaks into the element-template merge.
 */
const ELEMENT_TEMPLATES_SEGMENT: MarketplaceContentType = "element-templates";

/**
 * Local on-disk cache of fetched template files, the bridge between a remote
 * fetch and the existing template render pipeline.
 *
 * Layout: `<cacheRoot>/<marketplaceId>/<sourceIndex>/<contentType>/<repo-relative path>`.
 * Keying by `marketplaceId` then `sourceIndex` keeps sources isolated, so two
 * templates sharing a basename never clobber each other; the `<contentType>`
 * segment keeps a future JSON content type (lint rules, palette entries) out of
 * the element-template pipeline that reads this cache.
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

    async sourceIndexes(marketplaceId: string): Promise<number[]> {
        const marketplaceDir = `${this.cacheRoot}/${marketplaceId}`;
        return (await this.listSubdirectories(marketplaceDir))
            .map((sourceDir) => sourceDir.slice(marketplaceDir.length + 1))
            .filter((name) => /^\d+$/.test(name))
            .map(Number);
    }

    /**
     * Swaps the slot's files for `files`; each `repoPath` is reproduced verbatim
     * under its content type so distinct upstream files stay distinct on disk.
     *
     * @throws {Error} when a `repoPath` is absolute or contains a `..` segment,
     *   before anything is deleted. A self-hosted `baseUrl` is untrusted
     *   user-configured infrastructure and can return a hostile path (e.g.
     *   `../../../settings.json`); without this guard the concatenation would
     *   write attacker content outside the cache root.
     */
    async replaceSource(
        marketplaceId: string,
        sourceIndex: number,
        files: readonly FetchedTemplateFile[],
    ): Promise<void> {
        for (const file of files) {
            this.assertSafeRepoPath(file.repoPath);
        }
        const sourceDir = this.sourceDir(marketplaceId, sourceIndex);
        await this.workspace.deleteDirectory(sourceDir);
        for (const { contentType, repoPath, content } of files) {
            await this.workspace.writeFile(`${sourceDir}/${contentType}/${repoPath}`, content);
        }
    }

    async removeSource(marketplaceId: string, sourceIndex: number): Promise<void> {
        await this.workspace.deleteDirectory(this.sourceDir(marketplaceId, sourceIndex));
    }

    private sourceDir(marketplaceId: string, sourceIndex: number): string {
        return `${this.cacheRoot}/${marketplaceId}/${sourceIndex}`;
    }

    /**
     * Rejects a `repoPath` that would escape its cache slot. Real git trees only
     * ever use `/`, but a compromised server can send `\` or drive-letter forms,
     * so both separators are split and every absolute shape is refused — mirrors
     * the `isAbsolutePath` guard in `domain/marketplace.ts`.
     */
    private assertSafeRepoPath(repoPath: string): void {
        const isAbsolute =
            repoPath.startsWith("/") ||
            /^[a-zA-Z]:[\\/]/.test(repoPath) ||
            repoPath.startsWith("\\\\");
        const hasTraversal = repoPath.split(/[/\\]/).some((segment) => segment === "..");
        if (isAbsolute || hasTraversal) {
            throw new Error(`Rejected unsafe template path "${repoPath}"`);
        }
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
                paths.push(
                    ...(await this.listJsonRecursive(`${sourceDir}/${ELEMENT_TEMPLATES_SEGMENT}`)),
                );
            }
        }
        return paths;
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
