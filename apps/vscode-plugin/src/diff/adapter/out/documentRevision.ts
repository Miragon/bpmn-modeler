import { DiffRevision } from "@miragon/bpmn-modeler-core";

/**
 * Which version a diff pane's document shows, read from its URI as VS Code's
 * Git extension writes it (`toGitUri`): a `file:` document is the working
 * tree, and a `git:` document's JSON query names its ref: `""` reads the
 * index, `"~"` the index or HEAD when nothing is staged.
 */
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
    return ref === "~" ? { kind: "index-or-head" } : { kind: "ref", ref };
}

function gitRefOf(query: string): string | undefined {
    try {
        const { ref } = JSON.parse(query) as { ref?: unknown };
        return typeof ref === "string" ? ref : undefined;
    } catch {
        return undefined;
    }
}
