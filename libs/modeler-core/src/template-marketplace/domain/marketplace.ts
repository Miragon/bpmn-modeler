/**
 * Value objects and parsing for the element-template marketplace.
 *
 * A *marketplace* is one registered repository holding a `marketplace.json`
 * that does not store templates itself but *points* at where they live — in the
 * same repo via relative paths, or in other GitHub repos. This keeps the
 * external repos the single source of truth (issue #961): nothing is copied,
 * templates are fetched and merged into the existing render pipeline.
 *
 * A marketplace is registered as a GitHub repo, a GitLab project, or a local
 * on-disk folder (so manual testing and air-gapped/shared-drive setups need no
 * repository at all). Public and private repos are both supported, on the public
 * hosts and — via an object settings entry carrying a `baseUrl` — on self-hosted
 * GitHub Enterprise / GitLab. The parser rejects anything it cannot honour
 * rather than silently dropping it.
 */

import { MarketplaceSettingsEntry } from "../../shared/domain/hostPorts";

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
 * Where a registered marketplace's `marketplace.json` lives: a GitHub repo, a
 * GitLab project, or a local on-disk folder. The discriminant lets the service
 * resolve a registration to a concrete fetch without re-sniffing how it was
 * entered. `baseUrl` (absent = public host) names a self-hosted GHE / GitLab.
 */
export type MarketplaceLocation =
    | {
          readonly kind: "github";
          readonly owner: string;
          readonly repo: string;
          readonly ref?: string;
          readonly baseUrl?: string;
      }
    | {
          readonly kind: "gitlab";
          readonly projectPath: string;
          readonly ref?: string;
          readonly baseUrl?: string;
      }
    | { readonly kind: "local"; readonly rootDir: string };

/**
 * A registered marketplace: the GitHub/GitLab repo or local folder that holds
 * `marketplace.json`.
 *
 * `id` is a filesystem-safe key derived from the location (repo path plus `ref`
 * when pinned, or the folder path) so the on-disk cache layout
 * (`<globalStorage>/marketplaces/<id>/…`) is stable across refreshes yet
 * distinct for the same repo registered at two refs. `url` is a display label:
 * the verbatim string for a pasted URL, or {@link marketplaceEntryLabel}'s
 * `host/repo[@ref]` for an object settings entry (which has no single string).
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
          readonly baseUrl?: string;
          // A declared hint, not the source of truth (access is proven by the
          // fetch): lets the service pre-prompt for a token before hitting a
          // known-private repo. Undeclared-private repos still get the
          // failure-driven prompt.
          readonly visibility?: "public" | "private";
      }
    | {
          readonly kind: "gitlab";
          readonly projectPath: string;
          readonly ref?: string;
          readonly path: string;
          readonly baseUrl?: string;
          // Same hint role as on the github arm (D2).
          readonly visibility?: "public" | "private";
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
 * A `file://` URL or an absolute filesystem path registers a *local* folder;
 * a `github.com` URL (or the bare `owner/repo` shorthand) a GitHub repo; a
 * `gitlab.com` URL a GitLab project. Any other dotted host is rejected: a
 * self-hosted GHE / GitLab is registered through a `settings.json` object entry
 * carrying a `baseUrl` (see {@link parseMarketplaceEntry}), which a bare URL
 * string cannot express unambiguously.
 *
 * @throws {InvalidMarketplaceError} when the input is none of these.
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

    const local = parseLocalFolder(trimmed);
    if (local !== undefined) {
        return local;
    }

    const host = extractHost(trimmed);
    if (host === "gitlab.com") {
        return parseGitLabRepoUrl(trimmed);
    }
    // A bare `owner/repo` shorthand has no dotted host segment; treat it, and an
    // explicit github.com URL, as GitHub.
    if (host === undefined || host === "github.com") {
        return parseGitHubRepoUrl(trimmed);
    }
    throw new InvalidMarketplaceError(
        `unrecognized marketplace host "${host}" — register a self-hosted GitHub Enterprise ` +
            `or GitLab via a settings.json object entry with a "baseUrl": "${input}"`,
    );
}

/**
 * Extracts the lowercased host from a URL-ish string, or `undefined` for the
 * bare `owner/repo` shorthand. A GitHub/GitLab namespace segment never contains
 * a dot, so a dotted first segment is unambiguously a host.
 */
function extractHost(input: string): string | undefined {
    const firstSegment = input
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .split("/")[0]
        .toLowerCase();
    return firstSegment.includes(".") ? firstSegment : undefined;
}

/**
 * Validates a self-hosted `baseUrl` (GHE / self-hosted GitLab): an http(s)
 * absolute URL, returned with any trailing slash stripped so an adapter can
 * append `/api/...` without doubling the slash. Validating with `new URL` here
 * means {@link hostForConfig} can re-parse it without a try/catch.
 */
function parseBaseUrl(raw: unknown, context: string): string {
    if (typeof raw !== "string" || raw.trim().length === 0) {
        throw new InvalidMarketplaceError(`${context} "baseUrl" must be a non-empty string`);
    }
    let parsed: URL;
    try {
        parsed = new URL(raw.trim());
    } catch {
        throw new InvalidMarketplaceError(`${context} "baseUrl" is not a valid URL: "${raw}"`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new InvalidMarketplaceError(`${context} "baseUrl" must be an http(s) URL: "${raw}"`);
    }
    return stripTrailingSlashes(raw.trim());
}

/**
 * Trims trailing `/` by scanning from the end rather than a `\/+$` regex, whose
 * anchored quantifier backtracks polynomially (js/polynomial-redos) on
 * user-edited settings input.
 */
function stripTrailingSlashes(value: string): string {
    let end = value.length;
    while (end > 0 && value[end - 1] === "/") {
        end--;
    }
    return value.slice(0, end);
}

/**
 * Filesystem-safe cache key for a remote marketplace. `github.com` without a
 * `baseUrl` keeps the legacy `owner__repo[__ref]` slug so caches written before
 * slice 3 stay valid; every other origin is host-prefixed
 * (`<host>__<repo path with / → __>[__ref]`). A GitHub owner cannot contain a
 * dot, so a host-prefixed slug (always starting with a dotted host) can never
 * collide with a legacy one.
 */
function marketplaceId(
    host: string,
    repoPath: string,
    ref: string | undefined,
    legacyGithub: boolean,
): string {
    const path = repoPath.replace(/\//g, "__");
    const base = legacyGithub ? path : `${host}__${path}`;
    const slug = ref ? `${base}__${ref}` : base;
    return slug.replace(/[^a-zA-Z0-9._-]/g, "-");
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
    // `/tree/<ref>` is the only browse form desugared; a branch name may itself
    // contain slashes, so everything after `tree` is the ref.
    const ref = tail[0] === "tree" && tail.length > 1 ? tail.slice(1).join("/") : undefined;

    return {
        // Legacy (no host prefix): a github.com URL never carries a baseUrl, so
        // the same repo added by URL or by a baseUrl-less object entry shares one
        // cache slot; `ref` folds in so two refs of one repo cache separately.
        id: marketplaceId("github.com", `${owner}/${repo}`, ref, true),
        location: { kind: "github", owner, repo, ref },
        url: trimmed,
    };
}

/**
 * Parses a `gitlab.com` project reference into a {@link MarketplaceRegistration}.
 *
 * Accepts the pasteable forms — `https://gitlab.com/group/project`, a nested
 * `group/subgroup/project`, a `.git` clone URL, or a `/-/tree/<ref>` browse URL.
 * GitLab wraps the project path before the literal `/-/` route separator, so
 * everything before `/-/` is the project namespace and a `/-/tree/<ref…>` route
 * desugars into the `ref` (D1). Unlike GitHub there is no exactly-two-segment
 * rule: subgroups nest arbitrarily deep.
 *
 * @throws {InvalidMarketplaceError} when the input is not a GitLab project URL.
 */
function parseGitLabRepoUrl(input: string): MarketplaceRegistration {
    const trimmed = input.trim();
    const rest = trimmed
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .replace(/^gitlab\.com\//i, "")
        .replace(/\.git(?=$|\/|#|\?)/i, "")
        .split(/[?#]/)[0];

    // The project namespace ends at GitLab's `/-/` route separator, if present.
    const [projectPart, route] = rest.split("/-/");
    const projectSegments = projectPart.split("/").filter((segment) => segment.length > 0);
    if (projectSegments.length < 2) {
        throw new InvalidMarketplaceError(`not a GitLab project URL: "${input}"`);
    }

    let ref: string | undefined;
    if (route !== undefined) {
        const routeSegments = route.split("/").filter((segment) => segment.length > 0);
        if (routeSegments[0] === "tree" && routeSegments.length > 1) {
            ref = routeSegments.slice(1).join("/");
        }
    }

    const projectPath = projectSegments.join("/");
    return {
        id: marketplaceId("gitlab.com", projectPath, ref, false),
        location: { kind: "gitlab", projectPath, ref },
        url: trimmed,
    };
}

/**
 * Parses one persisted {@link MarketplaceSettingsEntry} into a registration.
 *
 * A string is a pasted URL / path (delegated to {@link parseMarketplaceUrl}).
 * An object is the settings-JSON-only form for a self-hosted host: validated
 * defensively (a user hand-edits `settings.json`) — provider enum, a
 * provider-appropriate `repo`, optional string `ref`, and an http(s) `baseUrl`.
 *
 * @throws {InvalidMarketplaceError} on any shape violation.
 */
export function parseMarketplaceEntry(entry: MarketplaceSettingsEntry): MarketplaceRegistration {
    if (typeof entry === "string") {
        return parseMarketplaceUrl(entry);
    }
    // The port types the object arm, but settings.json is user-edited, so treat
    // every field as unknown and re-validate rather than trust the shape.
    return parseMarketplaceObject(entry as Record<string, unknown>);
}

function parseMarketplaceObject(entry: Record<string, unknown>): MarketplaceRegistration {
    const { provider } = entry;
    if (provider !== "github" && provider !== "gitlab") {
        throw new InvalidMarketplaceError(
            `marketplace entry "provider" must be "github" or "gitlab"`,
        );
    }
    const { repo } = entry;
    if (typeof repo !== "string" || repo.trim().length === 0) {
        throw new InvalidMarketplaceError(`marketplace entry requires a non-empty "repo"`);
    }
    const { ref } = entry;
    if (ref !== undefined && typeof ref !== "string") {
        throw new InvalidMarketplaceError(`marketplace entry "ref" must be a string`);
    }
    const baseUrl =
        entry.baseUrl !== undefined ? parseBaseUrl(entry.baseUrl, "marketplace entry") : undefined;
    const host = baseUrl
        ? new URL(baseUrl).host
        : provider === "gitlab"
          ? "gitlab.com"
          : "github.com";

    const segments = repo
        .trim()
        .split("/")
        .filter((segment) => segment.length > 0);
    if (provider === "github") {
        // GitHub is exactly `owner/repo`.
        if (segments.length !== 2 || /\s/.test(repo)) {
            throw new InvalidMarketplaceError(
                `marketplace entry github "repo" must be "owner/repo"`,
            );
        }
        const [owner, repoName] = segments;
        return {
            // A baseUrl-less github entry keeps the legacy slug so it shares a
            // cache slot with the equivalent pasted URL.
            id: marketplaceId(host, `${owner}/${repoName}`, ref, baseUrl === undefined),
            location: { kind: "github", owner, repo: repoName, ref, baseUrl },
            url: entryLabel(host, `${owner}/${repoName}`, ref),
        };
    }
    // GitLab allows nested subgroups: `group[/subgroup…]/project`, ≥2 segments.
    if (segments.length < 2 || /\s/.test(repo)) {
        throw new InvalidMarketplaceError(
            `marketplace entry gitlab "repo" must be "group/project" (subgroups allowed)`,
        );
    }
    const projectPath = segments.join("/");
    return {
        id: marketplaceId(host, projectPath, ref, false),
        location: { kind: "gitlab", projectPath, ref, baseUrl },
        url: entryLabel(host, projectPath, ref),
    };
}

/** The `host/repo[@ref]` display label shared by object registrations and {@link marketplaceEntryLabel}. */
function entryLabel(host: string, repoPath: string, ref: string | undefined): string {
    return `${host}/${repoPath}${ref ? `@${ref}` : ""}`;
}

/**
 * A stable, human-readable label for a settings entry: the verbatim string, or
 * `host/repo[@ref]` for an object entry (which has no single URL string).
 *
 * Must never throw — {@link TemplateMarketplaceService.updateAll} needs a label
 * to name a marketplace in a warning *before* {@link parseMarketplaceEntry} has
 * proven the entry valid — so it reads every field defensively and falls back to
 * a JSON dump for a malformed object.
 */
export function marketplaceEntryLabel(entry: MarketplaceSettingsEntry): string {
    if (typeof entry === "string") {
        return entry;
    }
    if (typeof entry.repo !== "string") {
        return JSON.stringify(entry);
    }
    let host: string;
    try {
        host =
            typeof entry.baseUrl === "string" && entry.baseUrl.length > 0
                ? new URL(entry.baseUrl).host
                : entry.provider === "gitlab"
                  ? "gitlab.com"
                  : "github.com";
    } catch {
        host = entry.provider === "gitlab" ? "gitlab.com" : "github.com";
    }
    const ref = typeof entry.ref === "string" ? entry.ref : undefined;
    return entryLabel(host, entry.repo, ref);
}

/**
 * Validates a parsed `marketplace.json` object and projects its `sources[]`
 * into {@link TemplateSource}s.
 *
 * Invariants enforced (the reason this is a parser, not a cast): `sources` must
 * be a non-empty-shaped array; a `github` provider needs an `owner/repo` `repo`
 * and a `path`; a `gitlab` provider needs a `group/project` `repo` and a `path`;
 * a `local` provider needs an absolute or `~` `path`; a provider-less entry
 * carries a `path` and is read as marketplace-relative. Anything else throws so
 * a typo surfaces as a clear error instead of silently loading zero templates.
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

    if (source.provider === "gitlab") {
        return parseGitLabSource(source, index, path);
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
    const ref = parseSourceRef(source.ref, index);
    const visibility = parseSourceVisibility(source.visibility, index);
    const baseUrl = parseSourceBaseUrl(source.baseUrl, index);

    return {
        kind: "github",
        owner,
        repo: repoName,
        ref,
        path: normalizeSourcePath(path),
        baseUrl,
        visibility,
    };
}

/**
 * Projects a `provider: "gitlab"` source. `repo` is the full project namespace
 * (`group[/subgroup…]/project`, ≥2 segments — subgroups nest, so no exactly-two
 * rule); `visibility` and `baseUrl` are validated exactly as on the github arm.
 */
function parseGitLabSource(
    source: Record<string, unknown>,
    index: number,
    path: string,
): TemplateSource {
    const repo = source.repo;
    if (typeof repo !== "string" || !/^[^/\s]+(?:\/[^/\s]+)+$/.test(repo)) {
        throw new InvalidMarketplaceError(
            `sources[${index}] requires "repo" in "group/project" form (subgroups allowed)`,
        );
    }
    return {
        kind: "gitlab",
        projectPath: repo,
        ref: parseSourceRef(source.ref, index),
        path: normalizeSourcePath(path),
        baseUrl: parseSourceBaseUrl(source.baseUrl, index),
        visibility: parseSourceVisibility(source.visibility, index),
    };
}

/** Validates an optional string `ref` on a source. */
function parseSourceRef(ref: unknown, index: number): string | undefined {
    if (ref !== undefined && typeof ref !== "string") {
        throw new InvalidMarketplaceError(`sources[${index}] "ref" must be a string`);
    }
    return ref;
}

/**
 * Validates an optional `visibility` hint. A github/gitlab entry graduates it
 * from tolerated-unknown (as it stays on relative/local entries) to validated,
 * so a typo like `"privte"` fails loudly rather than silently degrading to the
 * failure-driven prompt path.
 */
function parseSourceVisibility(
    visibility: unknown,
    index: number,
): "public" | "private" | undefined {
    if (visibility !== undefined && visibility !== "public" && visibility !== "private") {
        throw new InvalidMarketplaceError(
            `sources[${index}] "visibility" must be "public" or "private"`,
        );
    }
    return visibility;
}

/** Validates an optional self-hosted `baseUrl` on a source. */
function parseSourceBaseUrl(baseUrl: unknown, index: number): string | undefined {
    return baseUrl !== undefined ? parseBaseUrl(baseUrl, `sources[${index}]`) : undefined;
}
