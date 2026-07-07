/**
 * Value objects and parsing for the element-template marketplace.
 *
 * A *marketplace* is one registered repository holding a `marketplace.json`
 * that does not store templates itself but *points* at where they live — in the
 * same repo via relative paths, or in other repos. External repos stay the
 * single source of truth: nothing is copied; templates are fetched and merged
 * into the existing render pipeline.
 *
 * A marketplace registers as a GitHub repo, a GitLab project, or a local
 * on-disk folder (so air-gapped/shared-drive setups need no repository).
 * Self-hosted GitHub Enterprise / GitLab are reached via an object settings
 * entry carrying a `baseUrl`. The parser rejects anything it cannot honour
 * rather than silently dropping it.
 */

import { MarketplaceSettingsEntry } from "../../shared/domain/hostPorts";

/**
 * Thrown when a `marketplace.json` (or the URL desugared into a registration)
 * is missing, malformed, or names an unsupported capability. Surfaced via
 * `notifyError`; the registration is then not added.
 */
export class InvalidMarketplaceError extends Error {
    constructor(reason: string) {
        super(`Invalid marketplace: ${reason}`);
        this.name = "InvalidMarketplaceError";
    }
}

/**
 * Where a registered marketplace's `marketplace.json` lives. The discriminant
 * lets the service resolve a registration to a concrete fetch without
 * re-sniffing how it was entered. `baseUrl` (absent = public host) names a
 * self-hosted GHE / GitLab.
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
 * `id` is a filesystem-safe cache key derived from the location so the on-disk
 * layout (`<globalStorage>/marketplaces/<id>/…`) is stable across refreshes yet
 * distinct for the same repo registered at two refs. `url` is a display label:
 * the verbatim pasted string, or {@link marketplaceEntryLabel}'s `host/repo[@ref]`
 * for an object settings entry (which has no single string).
 */
export interface MarketplaceRegistration {
    readonly id: string;
    readonly location: MarketplaceLocation;
    readonly url: string;
}

/**
 * What kind of content a source serves. The marketplace format is shared across
 * future content types (properties-panel entries, palette entries, lint rules,
 * …); today only element templates exist, so the union has a single member and
 * grows as new pipelines are wired up. Reserving it now lets an older modeler
 * skip a newer marketplace's unknown content instead of mis-reading it.
 */
export type MarketplaceContentType = "element-templates";

/**
 * A `sources[]` entry resolved to where its templates live. `relative` points
 * back into the marketplace itself; `github`/`gitlab` name an external repo
 * directly; `local` names an absolute or `~`-rooted directory on this machine.
 * `local.path` is kept raw because `~` expansion needs the host's home
 * directory, known only at fetch time. `type` carries the source's content type
 * so the cache can segment it and the pipeline can claim only its own kind.
 *
 * `include` (optional) narrows which of the listed files a source contributes to
 * globs matched against the subtree-relative path — the escape hatch for
 * pointing a source at a monorepo where templates sit in nested folders among
 * unrelated `.json` files. Absent = keep every listed file (the default).
 */
export type TemplateSource =
    | {
          readonly kind: "relative";
          readonly type: MarketplaceContentType;
          readonly path: string;
          readonly include?: readonly string[];
      }
    | {
          readonly kind: "github";
          readonly type: MarketplaceContentType;
          readonly owner: string;
          readonly repo: string;
          readonly ref?: string;
          readonly path: string;
          readonly baseUrl?: string;
          // A hint, not the source of truth (the fetch proves access): lets the
          // service pre-prompt for a token before hitting a known-private repo.
          // Undeclared-private repos still get the failure-driven prompt.
          readonly visibility?: "public" | "private";
          readonly include?: readonly string[];
      }
    | {
          readonly kind: "gitlab";
          readonly type: MarketplaceContentType;
          readonly projectPath: string;
          readonly ref?: string;
          readonly path: string;
          readonly baseUrl?: string;
          readonly visibility?: "public" | "private";
          readonly include?: readonly string[];
      }
    | {
          readonly kind: "local";
          readonly type: MarketplaceContentType;
          readonly path: string;
          readonly include?: readonly string[];
      };

/**
 * Normalizes a source path so it compares cleanly as a git-tree prefix, with no
 * `""` vs `"/"` ambiguity. An empty result means "the repository root".
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
 * A `file://` URL or absolute path is a *local* folder; a `github.com` URL (or
 * bare `owner/repo` shorthand) a GitHub repo; a `gitlab.com` URL a GitLab
 * project. Any other dotted host is rejected: a self-hosted GHE / GitLab needs
 * a `baseUrl`, which a bare URL string cannot express unambiguously (use
 * {@link parseMarketplaceEntry}'s object form).
 */
export function parseMarketplaceUrl(input: string): MarketplaceRegistration {
    const trimmed = input.trim();
    // The host-agnostic core cannot expand `~` (only the host knows the home
    // directory) and expands it before registration. A raw `~` reaching here is
    // rejected rather than mis-read as the GitHub repo `~/x`.
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
 * The lowercased host, or `undefined` for the bare `owner/repo` shorthand. A
 * GitHub/GitLab namespace segment never contains a dot, so a dotted first
 * segment is unambiguously a host.
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
 * Validates a self-hosted `baseUrl` to an http(s) URL, returned with any
 * trailing slash stripped so an adapter can append `/api/...` without doubling
 * it. Validating with `new URL` here means {@link hostForConfig} can re-parse it
 * without a try/catch.
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
 * Scans from the end rather than a `\/+$` regex, whose anchored quantifier
 * backtracks polynomially (js/polynomial-redos) on user-edited settings input.
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
 * `baseUrl` keeps the legacy `owner__repo[__ref]` slug so older caches stay
 * valid; every other origin is host-prefixed. A GitHub owner cannot contain a
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
 * Returns `undefined` (not a throw) for a non-local input so the caller can fall
 * through to GitHub parsing — the bare `owner/repo` shorthand is relative, so it
 * never collides with an absolute path. A path pointing straight at
 * `marketplace.json` is accepted as sugar for its containing folder.
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

function isAbsolutePath(path: string): boolean {
    return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

function isHomePath(path: string): boolean {
    return path === "~" || path.startsWith("~/") || path.startsWith("~\\");
}

function toLocalFsPath(input: string): string | undefined {
    if (/^file:\/\//i.test(input)) {
        return fileUrlToPath(input);
    }
    return isAbsolutePath(input) ? input : undefined;
}

/**
 * Hand-rolled (no `node:url`) so the core stays host-agnostic. Splits the
 * authority (between `file://` and the first `/`) from the path so a UNC host
 * survives as `\\server\share` instead of being misread as a relative path
 * segment. Handles the empty/`localhost` authority and the
 * leading-slash-before-drive-letter quirk of `file:///C:/…`.
 */
function fileUrlToPath(url: string): string {
    const afterScheme = url.replace(/^file:\/\//i, "");
    const firstSlash = afterScheme.indexOf("/");
    const authority = firstSlash === -1 ? afterScheme : afterScheme.slice(0, firstSlash);
    const rawPath = firstSlash === -1 ? "" : afterScheme.slice(firstSlash);

    if (authority !== "" && authority.toLowerCase() !== "localhost") {
        // UNC host: `file://server/share` is the URL spelling of `\\server\share`.
        // Convert `/` separators *before* decoding so an encoded `%2F` inside a
        // segment survives instead of being turned into a real separator.
        return decodeURIComponent(`\\\\${authority}${rawPath.replace(/\//g, "\\")}`);
    }

    let path = decodeURIComponent(rawPath);
    if (/^\/[a-zA-Z]:/.test(path)) {
        path = path.slice(1);
    }
    return path;
}

/**
 * Scans from the end rather than a `[\\/]+$` regex, whose anchored quantifier
 * backtracks polynomially (js/polynomial-redos) on user-controlled input.
 */
export function trimTrailingSeparators(path: string): string {
    let end = path.length;
    while (end > 0 && (path[end - 1] === "/" || path[end - 1] === "\\")) {
        end--;
    }
    return path.slice(0, end);
}

function stripTrailingManifest(path: string): string {
    // A single `[\\/]` (no `+`) is linear, so only the separator run needs the
    // scan; this fixed-shape match is ReDoS-safe.
    return trimTrailingSeparators(path).replace(/[\\/]marketplace\.json$/i, "");
}

/**
 * Accepts the pasteable forms — full `https://github.com/o/r`, a `.git` clone
 * URL, a `/tree/<ref>` browse URL, or the bare `owner/repo` shorthand. A browse
 * URL desugars its `/tree/` segment(s) into the `ref`; there is no path to
 * disambiguate because `marketplace.json` always sits at the repo root.
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
    // survives as `owner`. A GitHub owner is never dotted, so a dotted first
    // segment is unambiguously a host we cannot honour here.
    if (owner.includes(".")) {
        throw new InvalidMarketplaceError(`not a public GitHub repository URL: "${input}"`);
    }
    // A branch name may contain slashes, so everything after `tree` is the ref.
    const ref = tail[0] === "tree" && tail.length > 1 ? tail.slice(1).join("/") : undefined;

    return {
        // Legacy (no host prefix): a github.com URL never carries a baseUrl, so
        // the same repo added by URL or by a baseUrl-less object entry shares one
        // cache slot.
        id: marketplaceId("github.com", `${owner}/${repo}`, ref, true),
        location: { kind: "github", owner, repo, ref },
        url: trimmed,
    };
}

/**
 * Accepts the pasteable forms, including a nested `group/subgroup/project` and a
 * `/-/tree/<ref>` browse URL. GitLab's literal `/-/` route separator bounds the
 * project namespace: everything before it is the path, and a `/-/tree/<ref…>`
 * route desugars into the `ref`. Unlike GitHub there is no exactly-two-segment
 * rule — subgroups nest arbitrarily deep.
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
 * A string entry is a pasted URL / path; an object entry is the settings-only
 * form for a self-hosted host, validated defensively because a user hand-edits
 * `settings.json`.
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
    // Subgroups nest, so ≥2 segments rather than an exactly-two rule.
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

function entryLabel(host: string, repoPath: string, ref: string | undefined): string {
    return `${host}/${repoPath}${ref ? `@${ref}` : ""}`;
}

/**
 * A human-readable label for a settings entry. Must never throw — the service
 * names a marketplace in a warning *before* {@link parseMarketplaceEntry} has
 * proven the entry valid — so it reads every field defensively and falls back to
 * a JSON dump for a malformed object.
 */
export function marketplaceEntryLabel(entry: MarketplaceSettingsEntry): string {
    if (typeof entry === "string") {
        return entry;
    }
    // `typeof null === "object"`, so a hand-edited `[null]` entry slips past the
    // string check; guard for a non-object before touching `entry.repo`.
    if (entry === null || typeof entry !== "object" || typeof entry.repo !== "string") {
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
 * One marketplace an update could not refresh at all. Only *manifest*-level
 * failures (the whole marketplace unusable) land here; per-source failures stay
 * in the log channel so a single bad source never masks a healthy marketplace.
 */
export interface MarketplaceUpdateFailure {
    readonly label: string; // from marketplaceEntryLabel()
    readonly reason: string; // error.message (manifest-level failure)
}

/**
 * Outcome of a whole update run so the host can turn it into one summary
 * message — how many marketplaces refreshed and which could not, with why.
 */
export interface MarketplaceUpdateOutcome {
    readonly succeeded: number;
    readonly failures: readonly MarketplaceUpdateFailure[];
}

/**
 * The result of validating a `marketplace.json`: the sources this version can
 * serve, plus one {@link skipped} reason per source whose content `type` this
 * version does not understand. Unknown types are skipped, not rejected, so an
 * older modeler still loads the element-template sources of a newer marketplace.
 */
export interface ParsedMarketplace {
    readonly sources: TemplateSource[];
    readonly skipped: string[];
}

/**
 * Validates a parsed `marketplace.json` and projects its `sources[]` into
 * {@link TemplateSource}s. This is a parser, not a cast: a shape violation
 * throws so a typo surfaces as a clear error instead of silently loading zero
 * templates. An unknown (well-formed) content `type` is the one non-fatal case —
 * it lands in {@link ParsedMarketplace.skipped} so the caller can warn loudly.
 */
export function parseMarketplace(json: unknown): ParsedMarketplace {
    if (typeof json !== "object" || json === null) {
        throw new InvalidMarketplaceError("expected a JSON object");
    }

    const sources = (json as { sources?: unknown }).sources;
    if (!Array.isArray(sources)) {
        throw new InvalidMarketplaceError("`sources` must be an array");
    }

    const parsed: TemplateSource[] = [];
    const skipped: string[] = [];
    sources.forEach((entry, index) => {
        const result = parseSource(entry, index);
        if ("unsupported" in result) {
            skipped.push(result.unsupported);
        } else {
            parsed.push(result);
        }
    });
    return { sources: parsed, skipped };
}

/** A source whose content `type` this version cannot serve; carries the warning text. */
interface UnsupportedSource {
    readonly unsupported: string;
}

function parseSource(entry: unknown, index: number): TemplateSource | UnsupportedSource {
    if (typeof entry !== "object" || entry === null) {
        throw new InvalidMarketplaceError(`sources[${index}] must be an object`);
    }

    const source = entry as Record<string, unknown>;
    // The content type is read before the rest of the shape: a future content
    // type may carry fields this version doesn't understand, so an unknown type
    // must short-circuit to "skip" rather than trip a later shape check.
    const type = parseContentType(source.type, index);
    if (type === undefined) {
        return {
            unsupported: `sources[${index}]: content type "${String(source.type)}" is not supported by this version`,
        };
    }

    const path = source.path;
    if (typeof path !== "string" || path.trim().length === 0) {
        throw new InvalidMarketplaceError(`sources[${index}] is missing a non-empty "path"`);
    }

    const include = parseSourceInclude(source.include, index);

    if (source.provider === undefined) {
        return { kind: "relative", type, path: normalizeSourcePath(path), include };
    }

    if (source.provider === "local") {
        const local = path.trim();
        // A relative path belongs in a no-provider source (resolved against the
        // marketplace); reject it loudly rather than resolve it against an
        // undefined base. Kept raw — `~` is expanded at fetch time.
        if (!isAbsolutePath(local) && !isHomePath(local)) {
            throw new InvalidMarketplaceError(
                `sources[${index}] local "path" must be absolute or start with "~" ` +
                    `(use a provider-less source for a marketplace-relative path)`,
            );
        }
        return { kind: "local", type, path: local, include };
    }

    if (source.provider === "gitlab") {
        return parseGitLabSource(source, index, path, type, include);
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
        type,
        owner,
        repo: repoName,
        ref,
        path: normalizeSourcePath(path),
        baseUrl,
        visibility,
        include,
    };
}

/**
 * Resolves a source's reserved `type` discriminant. An omitted type defaults to
 * `element-templates` (the sole current type); a non-string is a shape error and
 * throws; a well-formed but unknown type returns `undefined` so the caller can
 * skip-with-warning rather than reject the whole marketplace.
 */
function parseContentType(raw: unknown, index: number): MarketplaceContentType | undefined {
    if (raw === undefined) {
        return "element-templates";
    }
    if (typeof raw !== "string") {
        throw new InvalidMarketplaceError(`sources[${index}] "type" must be a string`);
    }
    return raw === "element-templates" ? "element-templates" : undefined;
}

/**
 * `repo` is the full project namespace (≥2 segments — subgroups nest, so no
 * exactly-two rule).
 */
function parseGitLabSource(
    source: Record<string, unknown>,
    index: number,
    path: string,
    type: MarketplaceContentType,
    include: readonly string[] | undefined,
): TemplateSource {
    const repo = source.repo;
    if (typeof repo !== "string" || !/^[^/\s]+(?:\/[^/\s]+)+$/.test(repo)) {
        throw new InvalidMarketplaceError(
            `sources[${index}] requires "repo" in "group/project" form (subgroups allowed)`,
        );
    }
    return {
        kind: "gitlab",
        type,
        projectPath: repo,
        ref: parseSourceRef(source.ref, index),
        path: normalizeSourcePath(path),
        baseUrl: parseSourceBaseUrl(source.baseUrl, index),
        visibility: parseSourceVisibility(source.visibility, index),
        include,
    };
}

function parseSourceRef(ref: unknown, index: number): string | undefined {
    if (ref !== undefined && typeof ref !== "string") {
        throw new InvalidMarketplaceError(`sources[${index}] "ref" must be a string`);
    }
    return ref;
}

/**
 * Normalizes a source's optional `include` field into a list of glob patterns.
 * A parser, not a cast: an omitted field passes through as `undefined` (keep
 * every listed file), a bare string is sugar for a one-element list, and a
 * present value must be a non-empty array of non-empty strings — a typo fails
 * loudly rather than silently matching nothing.
 *
 * A leading `/` or a `..` segment is rejected: patterns match a subtree-relative
 * path (which never starts with `/` or escapes upward), so either can only be a
 * mistake that would silently match no file.
 */
function parseSourceInclude(raw: unknown, index: number): readonly string[] | undefined {
    if (raw === undefined) {
        return undefined;
    }
    const patterns = typeof raw === "string" ? [raw] : raw;
    if (!Array.isArray(patterns) || patterns.length === 0) {
        throw new InvalidMarketplaceError(
            `sources[${index}] "include" must be a non-empty string or array of glob strings`,
        );
    }
    for (const pattern of patterns) {
        if (typeof pattern !== "string" || pattern.trim().length === 0) {
            throw new InvalidMarketplaceError(
                `sources[${index}] "include" patterns must be non-empty strings`,
            );
        }
        if (pattern.startsWith("/") || pattern.split("/").includes("..")) {
            throw new InvalidMarketplaceError(
                `sources[${index}] "include" pattern "${pattern}" must be relative and must not contain ".." segments`,
            );
        }
    }
    return patterns as string[];
}

/**
 * On a github/gitlab entry `visibility` is validated (not tolerated-unknown) so
 * a typo like `"privte"` fails loudly rather than silently degrading to the
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

function parseSourceBaseUrl(baseUrl: unknown, index: number): string | undefined {
    return baseUrl !== undefined ? parseBaseUrl(baseUrl, `sources[${index}]`) : undefined;
}
