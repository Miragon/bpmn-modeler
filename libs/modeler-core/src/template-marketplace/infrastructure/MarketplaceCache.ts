import { MarketplaceContentType } from "../domain/marketplace";
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
 * Files are overwritten in place on refresh; templates that disappeared
 * upstream are not pruned — that needs a delete capability the port lacks.
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

    /**
     * `repoPath` is reproduced verbatim under the slot so distinct upstream
     * files stay distinct on disk. `contentType` segments the slot so a source's
     * files never mingle with another content type sharing the same source slot.
     *
     * @throws {Error} when `repoPath` is absolute or contains a `..` segment. A
     *   self-hosted `baseUrl` is untrusted user-configured infrastructure and can
     *   return a hostile path (e.g. `../../../settings.json`); without this guard
     *   the concatenation below would write attacker content outside the cache
     *   root. Skipped, not fatal — `cacheSource` catches per source.
     */
    async write(
        marketplaceId: string,
        sourceIndex: number,
        contentType: MarketplaceContentType,
        repoPath: string,
        content: string,
    ): Promise<void> {
        this.assertSafeRepoPath(repoPath);
        const target = `${this.cacheRoot}/${marketplaceId}/${sourceIndex}/${contentType}/${repoPath}`;
        await this.workspace.writeFile(target, content);
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
