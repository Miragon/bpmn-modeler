import { HttpClient, HttpResponse } from "../../deployment/domain/ports";
import {
    GitHubSourceConfig,
    hostForConfig,
    RepositoryAccessError,
    RepositorySource,
} from "../domain/ports";

// GitHub's REST API rejects requests without a User-Agent; identify the client.
const USER_AGENT = "bpmn-modeler";

/**
 * {@link RepositorySource} over the GitHub REST + raw APIs, on public
 * `github.com` or a self-hosted GitHub Enterprise instance (`config.baseUrl`).
 *
 * Listing uses the recursive git-tree API: one call returns the whole tree,
 * avoiding the per-directory Contents calls that would blow through GitHub's
 * 60 req/hr unauthenticated rate limit on a deep template folder.
 *
 * Fetching splits on whether the blob can come from the raw host. Only public
 * github.com uses `raw.githubusercontent.com` and never sends the token there.
 * A `token` *or* a `baseUrl` switches to the Contents API, which serves private
 * repos and is the only blob route on GHE — enterprise has no raw host.
 */
export class GitHubSource implements RepositorySource {
    // Memoized so a missing `ref` triggers exactly one default-branch lookup
    // shared by listing and every fetch.
    private resolvedRef: string | undefined;

    constructor(
        private readonly http: HttpClient,
        private readonly config: GitHubSourceConfig,
    ) {}

    async listTemplateFiles(): Promise<string[]> {
        const { owner, repo } = this.config;
        const ref = await this.resolveRef();

        const url = `${this.apiRoot()}/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
        const response = await this.http.getJson(url, this.apiHeaders());
        if (response.status !== 200) {
            this.throwFor(response, `GitHub tree request failed for ${owner}/${repo}@${ref}`);
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
        // overflow; listing the partial set would silently drop templates.
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
        const { owner, repo, token, baseUrl } = this.config;
        const ref = await this.resolveRef();

        // The raw host cannot see private blobs, and GHE has no raw host at all,
        // so an authenticated *or* enterprise read goes through the Contents API.
        if (token || baseUrl) {
            return this.fetchViaContentsApi(repoPath, ref);
        }

        // Encode per segment so a filename with `#`, `?`, or `%` can't truncate
        // or mis-decode the URL (the `/` separators must survive). Leaving `ref`
        // raw is intentional: slashed refs work via greedy route matching.
        const encodedPath = repoPath.split("/").map(encodeURIComponent).join("/");
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${encodedPath}`;
        // Raw host gets only the User-Agent — never the auth header.
        const response = await this.http.getText(url, { "User-Agent": USER_AGENT });
        if (response.status !== 200) {
            this.throwFor(response, `Failed to fetch ${repoPath} from ${owner}/${repo}@${ref}`);
        }
        return response.body;
    }

    /**
     * Reads one blob through the authenticated Contents API. Path segments are
     * encoded individually so the `/` separators survive; `Accept: raw+json`
     * returns the file bytes verbatim rather than the base64 JSON envelope.
     */
    private async fetchViaContentsApi(repoPath: string, ref: string): Promise<string> {
        const { owner, repo } = this.config;
        const encodedPath = repoPath.split("/").map(encodeURIComponent).join("/");
        const url =
            `${this.apiRoot()}/repos/${owner}/${repo}/contents/${encodedPath}` +
            `?ref=${encodeURIComponent(ref)}`;
        const response = await this.http.getText(url, {
            ...this.apiHeaders(),
            Accept: "application/vnd.github.raw+json",
        });
        if (response.status !== 200) {
            this.throwFor(response, `Failed to fetch ${repoPath} from ${owner}/${repo}@${ref}`);
        }
        return response.body;
    }

    /** Resolves the repo's default branch when no `ref` was configured. */
    private async resolveRef(): Promise<string> {
        if (this.config.ref) {
            return this.config.ref;
        }
        if (this.resolvedRef) {
            return this.resolvedRef;
        }

        const { owner, repo } = this.config;
        const response = await this.http.getJson(
            `${this.apiRoot()}/repos/${owner}/${repo}`,
            this.apiHeaders(),
        );
        if (response.status !== 200) {
            this.throwFor(response, `Failed to resolve default branch for ${owner}/${repo}`);
        }

        const branch = (JSON.parse(response.body) as { default_branch?: unknown }).default_branch;
        if (typeof branch !== "string") {
            throw new Error(`GitHub returned no default_branch for ${owner}/${repo}`);
        }
        return (this.resolvedRef = branch);
    }

    /** `<baseUrl>/api/v3` for GitHub Enterprise, else public `api.github.com`. */
    private apiRoot(): string {
        return this.config.baseUrl ? `${this.config.baseUrl}/api/v3` : "https://api.github.com";
    }

    private apiHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            "Accept": "application/vnd.github+json",
            "User-Agent": USER_AGENT,
        };
        if (this.config.token) {
            headers.Authorization = `Bearer ${this.config.token}`;
        }
        return headers;
    }

    /**
     * Maps a non-200 GitHub response to a domain error so the service can
     * prompt-and-retry. 401/403/404 are auth-shaped — GitHub hides an invisible
     * private repo behind a 404 — and a rate-limit-looking 403 is flagged so the
     * wording differs. Any other status stays a plain `Error`.
     */
    private throwFor(response: HttpResponse, action: string): never {
        const { owner, repo } = this.config;
        const { status } = response;
        if (status === 401 || status === 403 || status === 404) {
            const rateLimited = status === 403 && /rate limit/i.test(response.body);
            // `hostForConfig` can't return undefined for a github config.
            throw new RepositoryAccessError(
                hostForConfig(this.config)!,
                status,
                `${owner}/${repo}`,
                rateLimited,
            );
        }
        throw new Error(`${action} (HTTP ${status})`);
    }
}
