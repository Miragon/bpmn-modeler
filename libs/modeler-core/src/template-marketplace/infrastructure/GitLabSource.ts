import { HttpClient, HttpResponse } from "../../deployment/domain/ports";
import {
    GitLabSourceConfig,
    hostForConfig,
    RepositoryAccessError,
    RepositorySource,
} from "../domain/ports";

// Sent on every request to identify the client, mirroring GitHubSource.
const USER_AGENT = "bpmn-modeler";

// GitLab's tree API paginates by offset (there is no one-shot recursive tree,
// and keyset pagination needs response headers `HttpResponse` does not carry).
// 100 is GitLab's max `per_page`; the page cap bounds a single source to 10k
// blobs so a runaway repo fails loudly (D6) instead of looping unbounded.
const TREE_PAGE_SIZE = 100;
const MAX_TREE_PAGES = 100;

/**
 * {@link RepositorySource} over the GitLab REST API, on public `gitlab.com` or a
 * self-hosted instance (`config.baseUrl`).
 *
 * Listing offset-paginates the recursive tree API (`?recursive=true`), scoping
 * to the source subtree server-side with `path=` — GitLab returns repo-root-
 * relative paths that round-trip straight into {@link fetchFile}. Blob fetches
 * use the raw files endpoint, which works unauthenticated for public projects
 * and needs no default-branch lookup (an omitted `ref` resolves server-side,
 * unlike GitHub). Authentication is the canonical `PRIVATE-TOKEN` header, sent
 * only when a token is present (D9).
 */
export class GitLabSource implements RepositorySource {
    constructor(
        private readonly http: HttpClient,
        private readonly config: GitLabSourceConfig,
    ) {}

    /**
     * Lists the `.json` blob paths under the source subtree. `path=` is
     * authoritative (the server already scoped the tree), so there is no
     * client-side prefix filter — only the blob / `.json` shape is checked.
     *
     * Pagination stops at the first short page. Reaching {@link MAX_TREE_PAGES}
     * with a full final page means the tree may hold more entries than one run
     * can page through, so it fails loudly rather than present a partial
     * catalogue as complete (the D6 analog of GitHub's `truncated` guard).
     */
    async listTemplateFiles(): Promise<string[]> {
        const { projectPath } = this.config;
        const files: string[] = [];

        for (let page = 1; page <= MAX_TREE_PAGES; page++) {
            const response = await this.http.getJson(this.treeUrl(page), this.headers());
            if (response.status !== 200) {
                this.throwFor(response, `GitLab tree request failed for ${projectPath}`);
            }

            const entries = JSON.parse(response.body) as { type?: string; path?: string }[];
            if (!Array.isArray(entries)) {
                throw new Error(`Unexpected GitLab tree response for ${projectPath}`);
            }
            for (const entry of entries) {
                if (
                    entry.type === "blob" &&
                    typeof entry.path === "string" &&
                    entry.path.endsWith(".json")
                ) {
                    files.push(entry.path);
                }
            }

            // A short page is the last page; a full page may have a successor.
            if (entries.length < TREE_PAGE_SIZE) {
                return files;
            }
        }

        throw new Error(
            `GitLab tree for ${projectPath} exceeds ${MAX_TREE_PAGES * TREE_PAGE_SIZE} entries ` +
                `under the source path; too large to list completely (pin a narrower path or a SHA ref)`,
        );
    }

    async fetchFile(repoPath: string): Promise<string> {
        const response = await this.http.getText(this.fileUrl(repoPath), this.headers());
        if (response.status !== 200) {
            this.throwFor(response, `Failed to fetch ${repoPath} from ${this.config.projectPath}`);
        }
        return response.body;
    }

    /**
     * The paginated recursive-tree URL for `page`. The project path is a single
     * `encodeURIComponent`-encoded path segment (GitLab addresses a project by
     * its URL-encoded full path, not owner/repo segments). `ref` and `path` are
     * added only when set — an omitted `ref` lets the server pick the default
     * branch, and an empty `path` scans the whole repo.
     */
    private treeUrl(page: number): string {
        const project = encodeURIComponent(this.config.projectPath);
        let url =
            `${this.apiRoot()}/projects/${project}/repository/tree` +
            `?recursive=true&per_page=${TREE_PAGE_SIZE}&page=${page}`;
        if (this.config.ref) {
            url += `&ref=${encodeURIComponent(this.config.ref)}`;
        }
        if (this.config.path) {
            url += `&path=${encodeURIComponent(this.config.path)}`;
        }
        return url;
    }

    /**
     * The raw-blob URL. Both the project path and the file path are single,
     * one-shot `encodeURIComponent`-encoded segments — unlike GitHub's Contents
     * API, GitLab does not want the file path's `/`s left as separators.
     */
    private fileUrl(repoPath: string): string {
        const project = encodeURIComponent(this.config.projectPath);
        const file = encodeURIComponent(repoPath);
        let url = `${this.apiRoot()}/projects/${project}/repository/files/${file}/raw`;
        if (this.config.ref) {
            url += `?ref=${encodeURIComponent(this.config.ref)}`;
        }
        return url;
    }

    /** `<baseUrl>/api/v4` for a self-hosted instance, else public `gitlab.com`. */
    private apiRoot(): string {
        return this.config.baseUrl ? `${this.config.baseUrl}/api/v4` : "https://gitlab.com/api/v4";
    }

    private headers(): Record<string, string> {
        const headers: Record<string, string> = { "User-Agent": USER_AGENT };
        if (this.config.token) {
            headers["PRIVATE-TOKEN"] = this.config.token;
        }
        return headers;
    }

    /**
     * Maps a non-200 GitLab response to a domain error. 401/403/404 become a
     * {@link RepositoryAccessError} so the service can prompt-and-retry — GitLab,
     * like GitHub, hides an invisible private project behind a 404. GitLab's
     * rate limit is a dedicated 429, flagged so the wording says "rate limit"
     * (a token still raises the limit). Any other status stays a plain `Error`.
     *
     * @param action Human-readable description of the failed request. The token
     *   never appears in it (D9).
     */
    private throwFor(response: HttpResponse, action: string): never {
        const { status } = response;
        if (status === 401 || status === 403 || status === 404 || status === 429) {
            throw new RepositoryAccessError(
                hostForConfig(this.config)!,
                status,
                this.config.projectPath,
                status === 429,
            );
        }
        throw new Error(`${action} (HTTP ${status})`);
    }
}
