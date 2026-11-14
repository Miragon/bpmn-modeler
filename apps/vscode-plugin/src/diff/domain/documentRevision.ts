import { DiffRevision } from "@miragon/bpmn-modeler-core";

/**
 * Which version a diff pane's document shows, read from its URI as VS Code's
 * Git extension writes it (`toGitUri`): a `file:` document is the working
 * tree, and a `git:` document's JSON query names its ref: `""` reads the
 * index, `"~"` the index or HEAD when nothing is staged.
 */
/**
 * URI schemes of Git providers' ref, index and working-tree documents: VS Code's
 * Git extension uses `git:`, Theia's `@theia/git` (the standalone desktop shell)
 * `gitfs:`. Such a document is read-only and always belongs to a diff.
 */
const GIT_PROVIDED_SCHEMES = new Set<string>(["git", "gitfs"]);

/** Whether a document comes from a Git provider and so belongs to a diff. */
export function isGitProvidedDocument(uri: { readonly scheme: string }): boolean {
    return GIT_PROVIDED_SCHEMES.has(uri.scheme);
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

const FULL_COMMIT_HASH = /^([0-9a-f]{40})(\^?)$/i;
// The Git extension's default `git.commitShortHashLength`.
const SHORT_HASH_LENGTH = 7;

/** A commit as the Git extension names it in its diff titles; symbolic refs stay. */
function shortRef(ref: string): string {
    const commit = FULL_COMMIT_HASH.exec(ref);
    return commit ? `${commit[1].slice(0, SHORT_HASH_LENGTH)}${commit[2]}` : ref;
}
