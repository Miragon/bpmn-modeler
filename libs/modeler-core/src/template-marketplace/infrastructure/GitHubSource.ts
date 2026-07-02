import { HttpClient, HttpResponse } from "../../deployment/domain/ports";
import { GitHubSourceConfig, RepositoryAccessError, RepositorySource } from "../domain/ports";

// GitHub's REST API rejects requests without a User-Agent; identify the client.
const USER_AGENT = "bpmn-modeler";

// The origin every credential and access error is attributed to. Kept in step
// with `hostForConfig` so the service's per-host token bookkeeping lines up.
const GITHUB_HOST = "github.com";

/**
 * {@link RepositorySource} over the GitHub REST + raw APIs.
 *
 * Listing uses the **recursive git-tree API** (decision D6): one call returns
 * the whole tree, which is then filtered to `.json` blobs under the source
 * path — this avoids the per-directory Contents calls that would blow through
 * GitHub's 60 req/hr unauthenticated rate limit on a deep template folder.
 *
 * Fetching splits on whether a `token` is present. Unauthenticated, it reads
 * blobs from `raw.githubusercontent.com` (public files, no rate concern) and
 * deliberately never sends the token there (D9). Authenticated, it switches to
 * the Contents API (`GET /repos/o/r/contents/<path>`), which serves private
 * repos and is GHE-ready; the raw host cannot see private content.
 */
export class GitHubSource implements RepositorySource {
    // The resolved branch/tag/SHA, memoized so a missing `ref` triggers exactly
    // one default-branch lookup shared by listing and every fetch. A post-prompt
    // retry builds a *new* GitHubSource via the factory, so this can never carry
    // a stale ref across a token change.
    private resolvedRef: string | undefined;

    constructor(
        private readonly http: HttpClient,
        private readonly config: GitHubSourceConfig,
    ) {}

    async listTemplateFiles(): Promise<string[]> {
        const { owner, repo } = this.config;
        const ref = await this.resolveRef();

        const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
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
        const { owner, repo, token } = this.config;
        const ref = await this.resolveRef();

        // Private-repo + GHE-ready path: the raw host cannot see private blobs,
        // so an authenticated read goes through the Contents API instead.
        if (token) {
            return this.fetchViaContentsApi(repoPath, ref);
        }

        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${repoPath}`;
        // Raw host gets only the User-Agent — never the auth header (D9).
        const response = await this.http.getText(url, { "User-Agent": USER_AGENT });
        if (response.status !== 200) {
            this.throwFor(response, `Failed to fetch ${repoPath} from ${owner}/${repo}@${ref}`);
        }
        return response.body;
    }

    /**
     * Reads one blob through the authenticated Contents API. Path segments are
     * `encodeURIComponent`-encoded individually (a `/` between segments must
     * survive as a separator, so the whole path can't be encoded in one shot),
     * and the `ref` query value is encoded because a branch name may contain
     * a slash. `Accept: raw+json` makes GitHub return the file bytes verbatim
     * rather than the base64 JSON envelope.
     */
    private async fetchViaContentsApi(repoPath: string, ref: string): Promise<string> {
        const { owner, repo } = this.config;
        const encodedPath = repoPath.split("/").map(encodeURIComponent).join("/");
        const url =
            `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}` +
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
            this.throwFor(response, `Failed to resolve default branch for ${owner}/${repo}`);
        }

        const branch = (JSON.parse(response.body) as { default_branch?: unknown }).default_branch;
        if (typeof branch !== "string") {
            throw new Error(`GitHub returned no default_branch for ${owner}/${repo}`);
        }
        return (this.resolvedRef = branch);
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
     * Maps a non-200 GitHub response to a domain error. 401/403/404 become a
     * {@link RepositoryAccessError} so the service can prompt-and-retry — GitHub
     * hides an invisible private repo behind a 404, so it counts as auth-shaped
     * too. A 403 whose body reads like a rate-limit rejection is flagged (a
     * token still raises the limit, so this only changes the wording). Any other
     * status stays a plain `Error` the caller just logs and skips.
     *
     * @param action Human-readable description of the failed request. The token
     *   never appears in it (D9).
     */
    private throwFor(response: HttpResponse, action: string): never {
        const { owner, repo } = this.config;
        const { status } = response;
        if (status === 401 || status === 403 || status === 404) {
            const rateLimited = status === 403 && /rate limit/i.test(response.body);
            throw new RepositoryAccessError(GITHUB_HOST, status, `${owner}/${repo}`, rateLimited);
        }
        throw new Error(`${action} (HTTP ${status})`);
    }
}
