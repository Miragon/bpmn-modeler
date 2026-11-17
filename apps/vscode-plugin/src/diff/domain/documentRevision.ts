import { DiffRevision, isFullCommitHash, shortCommitHash } from "@miragon/bpmn-modeler-core";

/**
 * Which version a diff pane's document shows, read from its URI as VS Code's
 * Git extension writes it (`toGitUri`): a `file:` document is the working
 * tree, and a `git:` document's JSON query names its ref: `""` reads the
 * index, `"~"` the index or HEAD when nothing is staged.
 */
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

export function revisionOfDocument(uri: {
    readonly scheme: string;
    readonly query: string;
}): DiffRevision {
    if (uri.scheme === "file") {
        return { kind: "working-tree" };
    }
    const ref = uri.scheme === "git" ? gitRefOf(uri.query) : undefined;
    if (ref === undefined) {
        return { kind: "unknown" };
    }
    if (ref === "") return { kind: "index" };
    return ref === "~" ? { kind: "index-or-head" } : { kind: "ref", ref: shortRef(ref) };
}

function gitRefOf(query: string): string | undefined {
    try {
        const { ref } = JSON.parse(query) as { ref?: unknown };
        return typeof ref === "string" ? ref : undefined;
    } catch {
        return undefined;
    }
}

/** A commit as the Git extension names it in its diff titles, its parent too; symbolic refs stay. */
function shortRef(ref: string): string {
    const parent = ref.endsWith("^") ? "^" : "";
    const commit = ref.slice(0, ref.length - parent.length);
    return isFullCommitHash(commit) ? `${shortCommitHash(commit)}${parent}` : ref;
}
