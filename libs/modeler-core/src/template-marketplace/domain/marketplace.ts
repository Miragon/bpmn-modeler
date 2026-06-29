/**
 * Value objects and parsing for the element-template marketplace.
 *
 * A *marketplace* is one registered repository holding a `marketplace.json`
 * that does not store templates itself but *points* at where they live — in the
 * same repo via relative paths, or in other GitHub repos. This keeps the
 * external repos the single source of truth (issue #961): nothing is copied,
 * templates are fetched and merged into the existing render pipeline.
 *
 * Slice 1 supports public GitHub only; GitLab / `baseUrl` / private repos
 * follow in later slices, so the parser rejects anything it cannot yet honour
 * rather than silently dropping it.
 */

/**
 * Thrown when a `marketplace.json` (or the URL desugared into a registration)
 * is missing, malformed, or names a capability not supported in this slice.
 * Surfaced to the user via `notifyError`; the registration is then not added.
 */
export class InvalidMarketplaceError extends Error {
    constructor(reason: string) {
        super(`Invalid marketplace: ${reason}`);
        this.name = "InvalidMarketplaceError";
    }
}

/**
 * A registered marketplace: the GitHub repo that holds `marketplace.json`.
 *
 * `id` is a filesystem-safe key derived from `owner`/`repo` (plus `ref` when
 * one is pinned) so the on-disk cache layout (`<globalStorage>/marketplaces/<id>/…`)
 * is stable across refreshes yet distinct for the same repo registered at two
 * refs. `url` is kept verbatim so it round-trips through settings.
 */
export interface MarketplaceRegistration {
    readonly id: string;
    readonly owner: string;
    readonly repo: string;
    readonly ref?: string;
    readonly url: string;
}

/**
 * A `sources[]` entry resolved to where its templates live.
 *
 * `relative` points back into the marketplace repo itself (resolved against the
 * registration's owner/repo/ref at fetch time); `github` names an external repo
 * directly. The discriminant lets the service resolve both to a concrete
 * GitHub fetch without re-sniffing the raw JSON shape.
 */
export type TemplateSource =
    | { readonly kind: "relative"; readonly path: string }
    | {
          readonly kind: "github";
          readonly owner: string;
          readonly repo: string;
          readonly ref?: string;
          readonly path: string;
      };

/**
 * Strips a `./` prefix and surrounding slashes so a source path compares
 * cleanly as a tree prefix (`resources/element-templates`), never `""` vs `"/"`
 * ambiguity. An empty result means "the repository root".
 */
function normalizeSourcePath(raw: string): string {
    return raw
        .trim()
        .replace(/^\.?\//, "")
        .replace(/\/+$/, "");
}

/**
 * Parses a public-GitHub repo reference into a {@link MarketplaceRegistration}.
 *
 * Accepts the forms a user is likely to paste — full `https://github.com/o/r`,
 * a `.git` clone URL, a `/tree/<ref>` browse URL, or the bare `owner/repo`
 * shorthand. Per design decision D1, a browse URL is treated as sugar: the
 * segment(s) after `/tree/` become the `ref`; there is no path to disambiguate
 * because the marketplace repo's `marketplace.json` always sits at its root.
 *
 * @throws {InvalidMarketplaceError} when the input is not a GitHub repo URL.
 */
export function parseGitHubRepoUrl(input: string): MarketplaceRegistration {
    const trimmed = input.trim();
    const rest = trimmed
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .replace(/^github\.com\//i, "")
        .replace(/\.git(?=$|\/|#|\?)/i, "");

    const parts = rest
        .split(/[?#]/)[0]
        .split("/")
        .filter((segment) => segment.length > 0);

    if (parts.length < 2) {
        throw new InvalidMarketplaceError(`not a public GitHub repository URL: "${input}"`);
    }

    const [owner, repo, ...tail] = parts;
    // `/tree/<ref>` is the only browse form Slice 1 desugars; a branch name may
    // itself contain slashes, so everything after `tree` is the ref.
    const ref = tail[0] === "tree" && tail.length > 1 ? tail.slice(1).join("/") : undefined;

    // Fold `ref` into the id so the same repo pinned at two refs caches into
    // separate dirs instead of clobbering one shared `<owner>__<repo>` slot.
    const slug = ref ? `${owner}__${repo}__${ref}` : `${owner}__${repo}`;
    return {
        id: slug.replace(/[^a-zA-Z0-9._-]/g, "-"),
        owner,
        repo,
        ref,
        url: trimmed,
    };
}

/**
 * Validates a parsed `marketplace.json` object and projects its `sources[]`
 * into {@link TemplateSource}s.
 *
 * Invariants enforced (the reason this is a parser, not a cast): `sources` must
 * be a non-empty-shaped array; a `provider` entry must be GitHub (the only
 * provider this slice fetches) with a `owner/repo` `repo` and a `path`; a
 * provider-less entry must carry a `path` and is read as repo-relative. Anything
 * else throws so a typo surfaces as a clear error instead of silently loading
 * zero templates.
 *
 * @throws {InvalidMarketplaceError} on any shape violation.
 */
export function parseMarketplace(json: unknown): TemplateSource[] {
    if (typeof json !== "object" || json === null) {
        throw new InvalidMarketplaceError("expected a JSON object");
    }

    const sources = (json as { sources?: unknown }).sources;
    if (!Array.isArray(sources)) {
        throw new InvalidMarketplaceError("`sources` must be an array");
    }

    return sources.map((entry, index) => parseSource(entry, index));
}

function parseSource(entry: unknown, index: number): TemplateSource {
    if (typeof entry !== "object" || entry === null) {
        throw new InvalidMarketplaceError(`sources[${index}] must be an object`);
    }

    const source = entry as Record<string, unknown>;
    const path = source.path;
    if (typeof path !== "string" || path.trim().length === 0) {
        throw new InvalidMarketplaceError(`sources[${index}] is missing a non-empty "path"`);
    }

    if (source.provider === undefined) {
        return { kind: "relative", path: normalizeSourcePath(path) };
    }

    if (source.provider !== "github") {
        throw new InvalidMarketplaceError(
            `sources[${index}] provider "${String(source.provider)}" is not supported yet`,
        );
    }

    const repo = source.repo;
    if (typeof repo !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
        throw new InvalidMarketplaceError(`sources[${index}] requires "repo" in "owner/repo" form`);
    }
    const [owner, repoName] = repo.split("/");
    const ref = source.ref;
    if (ref !== undefined && typeof ref !== "string") {
        throw new InvalidMarketplaceError(`sources[${index}] "ref" must be a string`);
    }

    return {
        kind: "github",
        owner,
        repo: repoName,
        ref,
        path: normalizeSourcePath(path),
    };
}
