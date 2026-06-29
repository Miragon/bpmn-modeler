import { HttpClient } from "../../deployment/domain/ports";
import { RepositorySource, RepositorySourceConfig } from "../domain/ports";

// GitHub's REST API rejects requests without a User-Agent; identify the client.
const USER_AGENT = "bpmn-modeler";

/**
 * {@link RepositorySource} over the public GitHub REST + raw APIs.
 *
 * Listing uses the **recursive git-tree API** (decision D6): one call returns
 * the whole tree, which is then filtered to `.json` blobs under the source
 * path — this avoids the per-directory Contents calls that would blow through
 * GitHub's 60 req/hr unauthenticated rate limit on a deep template folder.
 * Fetching reads blobs from `raw.githubusercontent.com`, which serves public
 * files without authentication or rate concern.
 */
export class GitHubSource implements RepositorySource {
    // The resolved branch/tag/SHA, memoized so a missing `ref` triggers exactly
    // one default-branch lookup shared by listing and every fetch.
    private resolvedRef: string | undefined;

    constructor(
        private readonly http: HttpClient,
        private readonly config: RepositorySourceConfig,
    ) {}

    async listTemplateFiles(): Promise<string[]> {
        const { owner, repo } = this.config;
        const ref = await this.resolveRef();

        const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
        const response = await this.http.getJson(url, this.apiHeaders());
        if (response.status !== 200) {
            throw new Error(
                `GitHub tree request failed (HTTP ${response.status}) for ${owner}/${repo}@${ref}`,
            );
        }

        const parsed = JSON.parse(response.body) as {
            tree?: { path: string; type: string }[];
            truncated?: boolean;
        };
        const tree = parsed.tree;
        if (!Array.isArray(tree)) {
            throw new Error(`Unexpected GitHub tree response for ${owner}/${repo}@${ref}`);
        }
        // GitHub caps a recursive tree at 100k entries / 7MB and flags the
        // overflow. Listing the partial set would silently drop templates, so
        // fail loudly — the service logs it and skips this source rather than
        // presenting an incomplete catalogue as complete.
        if (parsed.truncated) {
            throw new Error(
                `GitHub tree for ${owner}/${repo}@${ref} is truncated; repository too large to list in one request`,
            );
        }

        // An empty source path means "scan the whole repo"; otherwise restrict
        // to blobs nested under `<path>/` so a sibling folder never leaks in.
        const prefix = this.config.path === "" ? "" : `${this.config.path}/`;
        return tree
            .filter(
                (entry) =>
                    entry.type === "blob" &&
                    entry.path.endsWith(".json") &&
                    (prefix === "" || entry.path.startsWith(prefix)),
            )
            .map((entry) => entry.path);
    }

    async fetchFile(repoPath: string): Promise<string> {
        const { owner, repo } = this.config;
        const ref = await this.resolveRef();

        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${repoPath}`;
        const response = await this.http.getText(url, { "User-Agent": USER_AGENT });
        if (response.status !== 200) {
            throw new Error(
                `Failed to fetch ${repoPath} from ${owner}/${repo}@${ref} (HTTP ${response.status})`,
            );
        }
        return response.body;
    }

    /**
     * Resolves the repo's default branch when no `ref` was configured. Both the
     * tree API and raw host accept a branch, tag, or SHA in the same position,
     * so a single resolved value drives every request.
     */
    private async resolveRef(): Promise<string> {
        if (this.config.ref) {
            return this.config.ref;
        }
        if (this.resolvedRef) {
            return this.resolvedRef;
        }

        const { owner, repo } = this.config;
        const response = await this.http.getJson(
            `https://api.github.com/repos/${owner}/${repo}`,
            this.apiHeaders(),
        );
        if (response.status !== 200) {
            throw new Error(
                `Failed to resolve default branch for ${owner}/${repo} (HTTP ${response.status})`,
            );
        }

        const branch = (JSON.parse(response.body) as { default_branch?: unknown }).default_branch;
        if (typeof branch !== "string") {
            throw new Error(`GitHub returned no default_branch for ${owner}/${repo}`);
        }
        return (this.resolvedRef = branch);
    }

    private apiHeaders(): Record<string, string> {
        return {
            "Accept": "application/vnd.github+json",
            "User-Agent": USER_AGENT,
        };
    }
}
