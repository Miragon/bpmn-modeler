import { DirectoryNotFound } from "../../shared/domain/errors";
import { WorkspacePort } from "../../shared/domain/hostPorts";
import { LocalSourceConfig, RepositorySource } from "../domain/ports";

/**
 * {@link RepositorySource} over a local on-disk folder, so a marketplace can be
 * a plain `marketplace.json` folder with no repository, network, or rate limit
 * — useful both for manual testing and for air-gapped / shared-drive setups.
 *
 * It speaks the same root-relative path vocabulary as {@link GitHubSource}: a
 * listed path includes its source-`path` prefix, and {@link fetchFile}
 * round-trips it against `rootDir`. That symmetry lets the service and cache
 * treat a local source exactly like a remote one — the templates are copied
 * into the same cache and merged through the same pipeline.
 */
export class LocalFileSource implements RepositorySource {
    constructor(
        private readonly workspace: WorkspacePort,
        private readonly config: LocalSourceConfig,
    ) {}

    /** Lists `.json` files under the source subtree as `rootDir`-relative paths. */
    listTemplateFiles(): Promise<string[]> {
        return this.listJsonRecursive(this.config.path);
    }

    fetchFile(repoPath: string): Promise<string> {
        return this.workspace.readFile(this.absolute(repoPath));
    }

    /**
     * A missing directory yields `[]` rather than throwing: an absent subtree is
     * an empty source, not a fatal error — the same tolerance the cache applies,
     * so a typo'd `path` warns-and-skips instead of failing the whole add.
     */
    private async listJsonRecursive(relDir: string): Promise<string[]> {
        let entries: [string, "file" | "directory"][];
        try {
            entries = await this.workspace.readDirectory(this.absolute(relDir));
        } catch (error) {
            if (error instanceof DirectoryNotFound) {
                return [];
            }
            throw error;
        }

        const files: string[] = [];
        for (const [name, type] of entries) {
            const childRelative = relDir ? `${relDir}/${name}` : name;
            if (type === "directory") {
                files.push(...(await this.listJsonRecursive(childRelative)));
            } else if (type === "file" && name.endsWith(".json")) {
                files.push(childRelative);
            }
        }
        return files;
    }

    /** Joins a root-relative path onto `rootDir`; `""` addresses the root itself. */
    private absolute(relativePath: string): string {
        const root = this.config.rootDir.replace(/[\\/]+$/, "");
        return relativePath ? `${root}/${relativePath}` : root;
    }
}
