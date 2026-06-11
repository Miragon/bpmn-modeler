/**
 * Pure domain core of the activity→code map: the in-memory entry shape, the
 * on-disk JSON artifact shape, the relative↔absolute path conversions, and the
 * single-file matchers that decide whether one source file implements a given
 * `(kind, reference)`.
 *
 * The matchers are the load-bearing piece. They are shared verbatim by the
 * always-on map's two cheap operations — *verifying* an already-linked file
 * still implements its activity, and *live-linking* a just-saved file to an
 * unresolved activity — and by the locator's batched scan, so all three agree on
 * what "implements" means without re-walking the workspace per reference.
 *
 * No `vscode` / Node host modules — only `path` (string math). The matchers
 * operate on content the caller already read, so this stays unit-testable
 * against plain strings.
 */
import { posix } from "path";

import {
    beanToClassName,
    extractBeanName,
    fqcnToGlobPath,
    ImplementationKind,
    JVM_EXTENSIONS,
} from "./ImplementationReference";

export type { ImplementationKind };

/** Bumped only on a breaking change to {@link CodeLinkMapJson}'s shape. */
export const CODE_LINK_SCHEMA_VERSION = 1;

/**
 * One activity's resolution state held in memory while the editor is open.
 * `paths` are absolute (the `uri.path` form the workspace search speaks) so they
 * can be read back for verification and compared against watcher events; they
 * are relativised only when written to the artifact.
 */
export interface CodeLinkMapEntry {
    activityId: string;
    kind: ImplementationKind;
    reference: string;
    resolved: boolean;
    paths: string[];
}

/** One entry as persisted: identical to {@link CodeLinkMapEntry} but with workspace-relative paths. */
export interface CodeLinkMapJsonEntry {
    activityId: string;
    kind: ImplementationKind;
    reference: string;
    resolved: boolean;
    paths: string[];
}

/**
 * The persisted artifact. A full inventory (unresolved entries included) so
 * external/AI tooling sees every task, and a warm cache the host reloads on the
 * next open to skip the cold batched scan.
 */
export interface CodeLinkMapJson {
    schemaVersion: number;
    bpmnFile: string;
    generatedAt: string;
    entries: CodeLinkMapJsonEntry[];
}

/**
 * Workspace-relative POSIX path of `absolutePath` under `workspaceRoot`. Both
 * inputs are `uri.path`-style POSIX strings, so `posix.relative` is exact.
 */
export function toRelative(absolutePath: string, workspaceRoot: string): string {
    return posix.relative(workspaceRoot, absolutePath);
}

/** Absolute path of a workspace-relative POSIX path — the inverse of {@link toRelative}. */
export function toAbsolute(relativePath: string, workspaceRoot: string): string {
    return posix.join(workspaceRoot, relativePath);
}

/**
 * Assembles the artifact from the in-memory entries, relativising every path so
 * the file is workspace-portable. Pure and deterministic given its inputs —
 * `generatedAt` is passed in rather than read from the clock here so the result
 * can be asserted in tests.
 */
export function buildMapJson(params: {
    bpmnFile: string;
    generatedAt: string;
    workspaceRoot: string;
    entries: readonly CodeLinkMapEntry[];
}): CodeLinkMapJson {
    return {
        schemaVersion: CODE_LINK_SCHEMA_VERSION,
        bpmnFile: params.bpmnFile,
        generatedAt: params.generatedAt,
        entries: params.entries.map((entry) => ({
            activityId: entry.activityId,
            kind: entry.kind,
            reference: entry.reference,
            resolved: entry.resolved,
            paths: entry.paths.map((path) => toRelative(path, params.workspaceRoot)),
        })),
    };
}

/**
 * Parses the artifact, returning `undefined` (not throwing) on anything that is
 * not a current-schema map — a hand-edited, truncated, or older file must
 * degrade to "no warm cache", never crash the open.
 */
export function parseMapJson(raw: string): CodeLinkMapJson | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return undefined;
    }
    if (
        typeof parsed !== "object" ||
        parsed === null ||
        (parsed as CodeLinkMapJson).schemaVersion !== CODE_LINK_SCHEMA_VERSION ||
        !Array.isArray((parsed as CodeLinkMapJson).entries)
    ) {
        return undefined;
    }
    // Validate each entry's shape too: an `entries` array alone is not enough.
    // A hand-edited/truncated file can carry a malformed element (e.g. `[null]`,
    // a missing field, or a non-string `paths`) that would NPE in
    // toAbsoluteEntries and crash the open. One bad entry drops the whole file.
    if (!(parsed as CodeLinkMapJson).entries.every(isValidJsonEntry)) {
        return undefined;
    }
    return parsed as CodeLinkMapJson;
}

/** Structural guard for one persisted entry — every field present and correctly typed. */
function isValidJsonEntry(entry: unknown): entry is CodeLinkMapJsonEntry {
    if (typeof entry !== "object" || entry === null) {
        return false;
    }
    const candidate = entry as Record<string, unknown>;
    return (
        typeof candidate.activityId === "string" &&
        typeof candidate.kind === "string" &&
        typeof candidate.reference === "string" &&
        typeof candidate.resolved === "boolean" &&
        Array.isArray(candidate.paths) &&
        candidate.paths.every((path) => typeof path === "string")
    );
}

/** Re-hydrates persisted entries to the in-memory shape (relative paths → absolute). */
export function toAbsoluteEntries(
    json: CodeLinkMapJson,
    workspaceRoot: string,
): CodeLinkMapEntry[] {
    return json.entries.map((entry) => ({
        activityId: entry.activityId,
        kind: entry.kind,
        reference: entry.reference,
        resolved: entry.resolved,
        paths: entry.paths.map((path) => toAbsolute(path, workspaceRoot)),
    }));
}

/**
 * `camunda:class` is a fully-qualified name, so the file path *is* the proof —
 * no content read needed. The package path must sit on a segment boundary
 * (start of path or after `/`) so a no-package `Foo` does not falsely match
 * `MyFoo.java`.
 */
export function matchesClassPath(fqcn: string, absolutePath: string): boolean {
    const packagePath = fqcnToGlobPath(fqcn);
    return JVM_EXTENSIONS.some((ext) => {
        const suffix = `${packagePath}.${ext}`;
        return absolutePath === suffix || absolutePath.endsWith(`/${suffix}`);
    });
}

/**
 * Whether the file is the conventional implementing class for a bean id —
 * `myBean` → `MyBean.java`. The first guess the locator makes for a
 * delegate/expression binding, matched on the file's basename alone.
 */
export function matchesBeanClassName(bean: string, absolutePath: string): boolean {
    const className = beanToClassName(bean);
    const base = posix.basename(absolutePath);
    return JVM_EXTENSIONS.some((ext) => base === `${className}.${ext}`);
}

/**
 * Whether `content` declares a worker for a free-form literal (external-task
 * topic or Zeebe job type) — the literal appears quoted, e.g.
 * `@JobWorker(type = "payment")` or `taskType: "payment"`.
 */
export function contentImplementsLiteral(content: string, literal: string): boolean {
    return matchesOutsideComments(content, new RegExp(`["']${escapeRegex(literal)}["']`));
}

/**
 * Whether `content` declares a Spring/CDI bean carrying the exact bean id, e.g.
 * `@Service("myBean")` — the fallback when the class file name differs from the
 * bean (an explicitly named `@Component(value = "myBean")`).
 */
export function contentDeclaresBean(content: string, bean: string): boolean {
    return matchesOutsideComments(
        content,
        new RegExp(
            `@(?:Component|Service|Repository|Named|Bean)\\s*\\(\\s*(?:value\\s*=\\s*)?["']${escapeRegex(
                bean,
            )}["']`,
        ),
    );
}

/**
 * The one decision both verification and live-linking ask: does the file at
 * `absolutePath` (with already-read `content`) implement `(kind, reference)`?
 * `content` is optional only for `javaClass`, which is decided by the path
 * alone; the content-based kinds report `false` when content is unavailable.
 */
export function fileMatchesEntry(
    kind: ImplementationKind,
    reference: string,
    absolutePath: string,
    content?: string,
): boolean {
    switch (kind) {
        case "javaClass":
            return matchesClassPath(reference, absolutePath);
        case "delegateExpression":
        case "expression": {
            const bean = extractBeanName(reference);
            if (!bean) {
                return false;
            }
            return (
                matchesBeanClassName(bean, absolutePath) ||
                (content !== undefined && contentDeclaresBean(content, bean))
            );
        }
        case "externalTopic":
        case "jobType":
            return content !== undefined && contentImplementsLiteral(content, reference);
    }
}

/** Escapes regex metacharacters so a user id/literal is matched verbatim. */
function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True if `pattern` matches at least one position outside an XML comment or
 * CDATA section — a commented-out declaration is not a real one. Mirrors the
 * workspace content search so the batched scan and these matchers never
 * disagree about the same file. For non-XML source the excluded ranges are
 * empty and matching behaves normally.
 *
 * Limitation: only XML comments/CDATA are excluded, not Java/JS line (`//`) or
 * block comments, so a commented-out annotation in a `.java` file can still
 * false-match. This is deliberate — a naive comment stripper would truncate on a
 * `//` inside a string literal and wrongly *hide* a real match (a worse failure
 * than an extra heuristic link). Revisit only with a real tokenizer if it bites.
 */
function matchesOutsideComments(content: string, pattern: RegExp): boolean {
    const excluded: Array<[number, number]> = [];
    for (const re of [/<!--[\s\S]*?-->/g, /<!\[CDATA\[[\s\S]*?\]\]>/g]) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
            excluded.push([m.index, m.index + m[0].length]);
        }
    }
    const global = new RegExp(
        pattern.source,
        pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );
    let match: RegExpExecArray | null;
    while ((match = global.exec(content)) !== null) {
        if (!excluded.some(([start, end]) => match!.index >= start && match!.index < end)) {
            return true;
        }
    }
    return false;
}
