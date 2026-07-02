/**
 * Value objects and parsing for the element-template marketplace.
 *
 * A *marketplace* is one registered repository holding a `marketplace.json`
 * that does not store templates itself but *points* at where they live — in the
 * same repo via relative paths, or in other GitHub repos. This keeps the
 * external repos the single source of truth (issue #961): nothing is copied,
 * templates are fetched and merged into the existing render pipeline.
 *
 * A marketplace is registered either as a public GitHub repo or as a local
 * on-disk folder (so manual testing and air-gapped/shared-drive setups need no
 * repository at all). Beyond that, Slice 1 supports public GitHub only; GitLab /
 * `baseUrl` / private repos follow in later slices, so the parser rejects
 * anything it cannot yet honour rather than silently dropping it.
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
 * Where a registered marketplace's `marketplace.json` lives: a public GitHub
 * repo, or a local on-disk folder. The discriminant lets the service resolve a
 * registration to a concrete fetch without re-sniffing how it was entered.
 */
export type MarketplaceLocation =
    | {
          readonly kind: "github";
          readonly owner: string;
          readonly repo: string;
          readonly ref?: string;
      }
    | { readonly kind: "local"; readonly rootDir: string };

/**
 * A registered marketplace: the GitHub repo or local folder that holds
 * `marketplace.json`.
 *
 * `id` is a filesystem-safe key derived from the location (owner/repo plus `ref`
 * when pinned, or the folder path) so the on-disk cache layout
 * (`<globalStorage>/marketplaces/<id>/…`) is stable across refreshes yet
 * distinct for the same repo registered at two refs. `url` is kept verbatim so
 * it round-trips through settings.
 */
export interface MarketplaceRegistration {
    readonly id: string;
    readonly location: MarketplaceLocation;
    readonly url: string;
}

/**
 * A `sources[]` entry resolved to where its templates live.
 *
 * `relative` points back into the marketplace itself (resolved against the
 * registration's location at fetch time); `github` names an external repo
 * directly; `local` names an absolute or `~`-rooted directory on this machine,
 * independent of the marketplace's own location. The discriminant lets the
 * service resolve each to a concrete fetch without re-sniffing the raw JSON
 * shape. `local.path` is kept raw (it may contain `~`) because home expansion
 * needs the host's home directory, resolved only at fetch time.
 */
export type TemplateSource =
    | { readonly kind: "relative"; readonly path: string }
    | {
          readonly kind: "github";
          readonly owner: string;
          readonly repo: string;
          readonly ref?: string;
          readonly path: string;
      }
    | { readonly kind: "local"; readonly path: string };

/**
 * Strips a `./` prefix and surrounding slashes so a source path compares
 * cleanly as a tree prefix (`resources/element-templates`), never `""` vs `"/"`
 * ambiguity. An empty result means "the repository root".
 */
function normalizeSourcePath(raw: string): string {
    const trimmed = raw.trim();
    // A bare `.` means the repository root; the `/^\.?\//` strip below only fires
    // with a slash, so `.` would otherwise survive and build a `"./"` prefix that
    // matches no git-tree path (silently zero templates on GitHub).
    if (trimmed === ".") {
        return "";
    }
    const withoutLeadingSlash = trimmed.replace(/^\.?\//, "");
    // Trim trailing slashes by scanning rather than a `\/+$` regex: the latter
    // backtracks quadratically on a path of many slashes (a polynomial-ReDoS).
    let end = withoutLeadingSlash.length;
    while (end > 0 && withoutLeadingSlash[end - 1] === "/") {
        end--;
    }
    return withoutLeadingSlash.slice(0, end);
}

/**
 * Parses a marketplace reference into a {@link MarketplaceRegistration}.
 *
 * A `file://` URL or an absolute filesystem path registers a *local* folder
 * (no repository required); anything else is parsed as a public GitHub repo.
 * The split is detected here so callers (and input validation) never re-derive
 * "is this local or remote".
 *
 * @throws {InvalidMarketplaceError} when the input is neither.
 */
export function parseMarketplaceUrl(input: string): MarketplaceRegistration {
    const trimmed = input.trim();
    // `~` is a shell convention the host-agnostic core cannot expand (it would
    // need the home directory, which only the host knows). The host layer
    // expands it before registration; if a raw `~` still reaches here, reject it
    // rather than silently mis-reading `~/x` as the GitHub repo `~/x`.
    if (trimmed.startsWith("~")) {
        throw new InvalidMarketplaceError(
            `"~" home paths must be expanded to an absolute path before registration: "${input}"`,
        );
    }
    return parseLocalFolder(trimmed) ?? parseGitHubRepoUrl(trimmed);
}

/**
 * Recognises a local marketplace folder from a `file://` URL or an absolute
 * path. Returns `undefined` (not a throw) for anything else so the caller can
 * fall through to GitHub parsing — the bare `owner/repo` shorthand is relative,
 * so it never collides with an absolute path.
 *
 * A path pointing straight at `marketplace.json` is accepted as sugar for its
 * containing folder, since the manifest is always read from the folder root.
 */
function parseLocalFolder(input: string): MarketplaceRegistration | undefined {
    const fsPath = toLocalFsPath(input);
    if (fsPath === undefined) {
        return undefined;
    }

    const rootDir = stripTrailingManifest(fsPath);
    return {
        // Prefix + sanitize so a local cache slot never collides with a
        // `<owner>__<repo>` GitHub slot and is a legal directory name.
        id: `local-${rootDir}`.replace(/[^a-zA-Z0-9._-]/g, "-"),
        location: { kind: "local", rootDir },
        url: input,
    };
}

/** POSIX absolute (`/…`), Windows drive (`C:\` / `C:/`), or UNC (`\\host`). */
function isAbsolutePath(path: string): boolean {
    return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

/** A `~`-rooted home path (`~`, `~/…`, or `~\…`). */
function isHomePath(path: string): boolean {
    return path === "~" || path.startsWith("~/") || path.startsWith("~\\");
}

/** @returns the filesystem path for a local input, or `undefined` if remote. */
function toLocalFsPath(input: string): string | undefined {
    if (/^file:\/\//i.test(input)) {
        return fileUrlToPath(input);
    }
    return isAbsolutePath(input) ? input : undefined;
}

/**
 * Converts a `file://` URL to a filesystem path without `node:url`, so the core
 * stays host-agnostic. Handles the empty/`localhost` authority and the
 * leading-slash-before-drive-letter quirk of `file:///C:/…`.
 */
function fileUrlToPath(url: string): string {
    let path = decodeURIComponent(url.replace(/^file:\/\//i, "").replace(/^localhost/i, ""));
    if (/^\/[a-zA-Z]:/.test(path)) {
        path = path.slice(1);
    }
    return path;
}

/**
 * Trims trailing path separators by scanning from the end rather than a
 * `[\\/]+$` regex. The anchored quantifier backtracks polynomially
 * (js/polynomial-redos) on a path of many separators followed by a
 * non-separator, on otherwise user-controlled input.
 */
export function trimTrailingSeparators(path: string): string {
    let end = path.length;
    while (end > 0 && (path[end - 1] === "/" || path[end - 1] === "\\")) {
        end--;
    }
    return path.slice(0, end);
}

/** Trims trailing separators and a trailing `marketplace.json` filename. */
function stripTrailingManifest(path: string): string {
    // A single `[\\/]` (no `+`) is linear, so only the separator run above needs
    // the scan; this fixed-shape match is ReDoS-safe.
    return trimTrailingSeparators(path).replace(/[\\/]marketplace\.json$/i, "");
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
function parseGitHubRepoUrl(input: string): MarketplaceRegistration {
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
    // The `github.com/` strip only fires for github.com, so a foreign host
    // (`gitlab.com/o/r`, `git.example.com/o/r`) survives as `owner`. A GitHub
    // username/org is alphanumerics + single hyphens — never a dot — so a dotted
    // first segment is unambiguously a host we cannot honour yet.
    if (owner.includes(".")) {
        throw new InvalidMarketplaceError(`not a public GitHub repository URL: "${input}"`);
    }
    // `/tree/<ref>` is the only browse form Slice 1 desugars; a branch name may
    // itself contain slashes, so everything after `tree` is the ref.
    const ref = tail[0] === "tree" && tail.length > 1 ? tail.slice(1).join("/") : undefined;

    // Fold `ref` into the id so the same repo pinned at two refs caches into
    // separate dirs instead of clobbering one shared `<owner>__<repo>` slot.
    const slug = ref ? `${owner}__${repo}__${ref}` : `${owner}__${repo}`;
    return {
        id: slug.replace(/[^a-zA-Z0-9._-]/g, "-"),
        location: { kind: "github", owner, repo, ref },
        url: trimmed,
    };
}

/**
 * Validates a parsed `marketplace.json` object and projects its `sources[]`
 * into {@link TemplateSource}s.
 *
 * Invariants enforced (the reason this is a parser, not a cast): `sources` must
 * be a non-empty-shaped array; a `github` provider needs a `owner/repo` `repo`
 * and a `path`; a `local` provider needs an absolute or `~` `path`; a
 * provider-less entry carries a `path` and is read as marketplace-relative.
 * Anything else throws so a typo surfaces as a clear error instead of silently
 * loading zero templates.
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

    if (source.provider === "local") {
        const local = path.trim();
        // An absolute or `~` path only; a relative one belongs in a no-provider
        // source (resolved against the marketplace), so reject it loudly rather
        // than resolve it against an undefined base. Kept raw — `~` is expanded
        // at fetch time, where the home directory is known.
        if (!isAbsolutePath(local) && !isHomePath(local)) {
            throw new InvalidMarketplaceError(
                `sources[${index}] local "path" must be absolute or start with "~" ` +
                    `(use a provider-less source for a marketplace-relative path)`,
            );
        }
        return { kind: "local", path: local };
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
