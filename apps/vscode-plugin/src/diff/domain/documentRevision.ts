import { DiffRevision, isFullCommitHash, shortCommitHash } from "@miragon/bpmn-modeler-core";

/**
 * URI schemes of Git providers' ref, index and working-tree documents: VS Code's
 * Git extension, which the standalone desktop shell ships too, uses `git:`;
 * Theia's own Git integration (`@theia/git`) uses `gitfs:`. Such a document is
 * read-only and always belongs to a diff.
 */
const GIT_PROVIDED_SCHEMES = new Set<string>(["git", "gitfs"]);

/** The scheme the merge view serves a conflicted file's two sides under. */
export const MERGE_SIDE_SCHEME = "bpmn-merge";

/** Whether a document comes from a Git provider and so belongs to a diff. */
export function isGitProvidedDocument(uri: { readonly scheme: string }): boolean {
    return GIT_PROVIDED_SCHEMES.has(uri.scheme);
}

/** Whether a document is one side of a merge view, which always belongs to one, live or ended. */
export function isMergeSideDocument(uri: { readonly scheme: string }): boolean {
    return uri.scheme === MERGE_SIDE_SCHEME;
}

/** Whether the file at a path has staged changes; `undefined` where Git cannot tell. */
export type StagedChangesLookup = (filePath: string) => boolean | undefined;

const CANNOT_TELL: StagedChangesLookup = () => undefined;

/**
 * Which version a diff pane's document shows, read from its URI as VS Code's
 * Git extension writes it (`toGitUri`): a `file:` document is the working
 * tree, and a `git:` document's JSON query names its file and its ref: `""`
 * reads the index, `"~"` the index while the file has staged changes and HEAD
 * otherwise, which `hasStagedChanges` tells.
 */
export function revisionOfDocument(
    uri: { readonly scheme: string; readonly query: string },
    hasStagedChanges: StagedChangesLookup = CANNOT_TELL,
): DiffRevision {
    if (uri.scheme === "file") {
        return { kind: "working-tree" };
    }
    const { ref, path } = uri.scheme === "git" ? gitQueryOf(uri.query) : {};
    if (ref === undefined) {
        return { kind: "unknown" };
    }
    if (ref === "") return { kind: "index" };
    if (ref !== "~") return { kind: "ref", ref: shortRef(ref) };
    const staged = path === undefined ? undefined : hasStagedChanges(path);
    return staged === undefined ? { kind: "index-or-head" } : { kind: "index-or-head", staged };
}

function gitQueryOf(query: string): { readonly ref?: string; readonly path?: string } {
    try {
        const { ref, path } = JSON.parse(query) as { ref?: unknown; path?: unknown };
        return {
            ...(typeof ref === "string" ? { ref } : {}),
            ...(typeof path === "string" ? { path } : {}),
        };
    } catch {
        return {};
    }
}

/** A commit as the Git extension names it in its diff titles, its parent too; symbolic refs stay. */
function shortRef(ref: string): string {
    const parent = ref.endsWith("^") ? "^" : "";
    const commit = ref.slice(0, ref.length - parent.length);
    return isFullCommitHash(commit) ? `${shortCommitHash(commit)}${parent}` : ref;
}
