import { DirectoryNotFound } from "../../shared/domain/errors";
import { WorkspacePort } from "../../shared/domain/hostPorts";

/**
 * Local on-disk cache of fetched template files, the bridge between a remote
 * fetch and the existing template render pipeline.
 *
 * Layout: `<cacheRoot>/<marketplaceId>/<sourceIndex>/<repo-relative path>`.
 * Keying by `marketplaceId` then `sourceIndex` keeps sources isolated, so two
 * templates sharing a basename never clobber each other.
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
     * files stay distinct on disk.
     */
    async writeTemplate(
        marketplaceId: string,
        sourceIndex: number,
        repoPath: string,
        content: string,
    ): Promise<void> {
        const target = `${this.cacheRoot}/${marketplaceId}/${sourceIndex}/${repoPath}`;
        await this.workspace.writeFile(target, content);
    }

    /** The merge input for the template pipeline; `[]` before anything is cached. */
    async getCachedTemplatePaths(): Promise<string[]> {
        return this.listJsonRecursive(this.cacheRoot);
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
