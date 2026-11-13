import { trimTrailingSeparators } from "../../domain/marketplace";
import { DirectoryEntryKind } from "../../../kernel/domain/directoryEntry";
import { DirectoryNotFound } from "../../../kernel/domain/errors";
import { WorkspacePort } from "../../../kernel/port/hostPorts";
import { LocalSourceConfig } from "../../domain/repositorySourceConfig";
import { RepositorySource } from "../../port/marketplacePorts";

/**
 * {@link RepositorySource} over a local on-disk folder, so a marketplace can be
 * a plain `marketplace.json` folder with no repository, network, or rate limit
 * — useful for manual testing and for air-gapped / shared-drive setups.
 *
 * It speaks the same root-relative path vocabulary as `GitHubSource`, so
 * the service and cache treat a local source exactly like a remote one.
 */
export class LocalFileSource implements RepositorySource {
    constructor(
        private readonly workspace: WorkspacePort,
        private readonly config: LocalSourceConfig,
    ) {}

    listTemplateFiles(): Promise<string[]> {
        return this.listJsonRecursive(this.config.path);
    }

    fetchFile(repoPath: string): Promise<string> {
        return this.workspace.readFile(this.absolute(repoPath));
    }

    /**
     * A missing directory yields `[]` rather than throwing, so a typo'd `path`
     * warns-and-skips instead of failing the whole add.
     */
    private async listJsonRecursive(relDir: string): Promise<string[]> {
        let entries: [string, DirectoryEntryKind][];
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

    private absolute(relativePath: string): string {
        // Scan-based trim (not `[\\/]+$`) to stay clear of js/polynomial-redos.
        const root = trimTrailingSeparators(this.config.rootDir);
        return relativePath ? `${root}/${relativePath}` : root;
    }
}
