import { type DiffOrigin, diffOriginSupports } from "@miragon/bpmn-modeler-types/domain";

import { uriDisplayName } from "../../kernel/domain/workspacePath";
import { DiffRevision, DiffSideVersion, revisionName } from "./DiffRevision";
import { ELEMENT_XML_TITLE_INFIX, compareTabLabel } from "./diffTabLabel";

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
    return `${elementId}${ELEMENT_XML_TITLE_INFIX}${versionsLabel(origin, before, after)}`;
}

function versionsLabel(
    origin: DiffOrigin,
    before: DiffSideVersion,
    after: DiffSideVersion,
): string {
    const beforeName = uriDisplayName(before.uri);
    const afterName = uriDisplayName(after.uri);
    if (diffOriginSupports(origin, "namesFiles") || beforeName !== afterName) {
        return compareTabLabel(beforeName, afterName);
    }
    const beforeVersion = revisionName(before.revision);
    const afterVersion = revisionName(after.revision);
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
