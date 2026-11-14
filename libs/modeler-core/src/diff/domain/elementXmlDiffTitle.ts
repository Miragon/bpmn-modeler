import type { DiffOrigin } from "@miragon/bpmn-modeler-types";

import { uriDisplayName } from "../../kernel/domain/workspacePath";
import { DiffRevision, DiffSideVersion } from "./DiffRevision";
import { compareTabLabel } from "./diffTabLabel";

/**
 * The title of the text diff that shows one element's XML from both sides of
 * a diagram diff: both files of a compare, the file and both versions of an
 * SCM diff, as VS Code labels its own diff tabs.
 */
export function elementXmlDiffTitle(
    elementId: string,
    origin: DiffOrigin,
    before: DiffSideVersion,
    after: DiffSideVersion,
): string {
    return `${elementId} (XML): ${sidesLabel(origin, before, after)}`;
}

function sidesLabel(origin: DiffOrigin, before: DiffSideVersion, after: DiffSideVersion): string {
    const beforeName = uriDisplayName(before.uri);
    const afterName = uriDisplayName(after.uri);
    if (origin === "compare-files" || beforeName !== afterName) {
        return compareTabLabel(beforeName, afterName);
    }
    const beforeVersion = revisionLabel(before.revision);
    const afterVersion = revisionLabel(after.revision);
    if (!beforeVersion || !afterVersion) {
        return beforeName;
    }
    const newerSideOnly = newerSideLabel(before.revision, after.revision);
    if (newerSideOnly) {
        return `${beforeName} (${newerSideOnly})`;
    }
    return compareTabLabel(`${beforeName} (${beforeVersion})`, `${afterName} (${afterVersion})`);
}

// Mirrors the VS Code Git extension's own diff titles (resolveTimelineOpenDiffCommand).
function newerSideLabel(before: DiffRevision, after: DiffRevision): string | undefined {
    const beforeIsHead = before.kind === "ref" && before.ref === "HEAD";
    if (after.kind === "working-tree" && (beforeIsHead || before.kind === "index-or-head")) {
        return "Working Tree";
    }
    if ((after.kind === "index" || after.kind === "index-or-head") && beforeIsHead) {
        return "Index";
    }
    return undefined;
}

function revisionLabel(revision: DiffRevision): string | undefined {
    switch (revision.kind) {
        case "working-tree":
            return "Working Tree";
        case "index":
        case "index-or-head":
            return "Index";
        case "ref":
            return shortRef(revision.ref);
        case "unknown":
            return undefined;
    }
}

const FULL_COMMIT_HASH = /^([0-9a-f]{40})(\^?)$/i;
// The Git extension's default `git.commitShortHashLength`.
const SHORT_HASH_LENGTH = 7;

function shortRef(ref: string): string {
    const commit = FULL_COMMIT_HASH.exec(ref);
    return commit ? `${commit[1].slice(0, SHORT_HASH_LENGTH)}${commit[2]}` : ref;
}
