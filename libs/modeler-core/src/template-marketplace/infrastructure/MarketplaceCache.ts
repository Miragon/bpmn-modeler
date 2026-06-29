import { DirectoryNotFound } from "../../shared/domain/errors";
import { WorkspacePort } from "../../shared/domain/hostPorts";

/**
 * Local on-disk cache of fetched template files, the bridge between a remote
 * fetch and the existing template render pipeline.
 *
 * Layout: `<cacheRoot>/<marketplaceId>/<sourceIndex>/<repo-relative path>`.
 * Keying by `marketplaceId` then `sourceIndex` keeps each registration's
 * sources isolated, so two marketplaces (or two sources) that ship a template
 * with the same basename never clobber each other.
 *
 * Writes go through {@link WorkspacePort} (which accepts absolute paths outside
 * the workspace and mkdirps parents), so the cache works identically in every
 * host. Files are overwritten in place on refresh — Slice 1 does not prune
 * templates that disappeared upstream; that needs a delete capability the port
 * does not yet expose.
 */
export class MarketplaceCache {
    /**
     * @param cacheRoot Absolute path to the `marketplaces/` directory under the
     *   host's global storage.
     * @param workspace Filesystem port; the same one the rest of the core uses.
     */
    constructor(
        private readonly cacheRoot: string,
        private readonly workspace: WorkspacePort,
    ) {}

    /**
     * Writes one fetched template under its marketplace/source slot. `repoPath`
     * is the remote repo-relative path; it is reproduced verbatim under the slot
     * so distinct upstream files stay distinct on disk.
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

    /**
     * Lists every cached `.json` file across all marketplaces as absolute paths,
     * the merge input for the template pipeline. Returns `[]` before anything
     * has been cached (the directory simply does not exist yet).
     */
    async getCachedTemplatePaths(): Promise<string[]> {
        return this.listJsonRecursive(this.cacheRoot);
    }

    /**
     * Recursively collects `.json` files under `folder`. A missing directory is
     * an expected empty result (nothing cached yet / a never-written source),
     * not an error, so it maps to `[]`.
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
