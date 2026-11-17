import type { MergeCaptionRole, MergeSide, MergeSideCaption } from "@miragon/bpmn-modeler-types";

// The one home of every merge word the webview renders; each is a translation key.
const MERGE_SIDE_TEXTS: Record<MergeSide, string> = {
    current: "Current",
    incoming: "Incoming",
};

const MERGE_ROLE_TEXTS: Record<MergeCaptionRole, string | undefined> = {
    branch: "your branch",
    upstream: "other branch",
    yourCommit: "your commit",
    stash: "your stash",
    unknown: undefined,
};

/**
 * A merge pane's label: its side, what the side is to the user, and the
 * branch and commit it shows (`Current: your branch main · 1a2b3c4`). Branch
 * names and hashes stay as Git wrote them.
 */
export function mergeCaptionText(
    caption: MergeSideCaption,
    translate: (key: string) => string,
): string {
    const role = MERGE_ROLE_TEXTS[caption.role];
    const name = [role === undefined ? undefined : translate(role), caption.ref]
        .filter((part) => part !== undefined)
        .join(" ");
    const detail = [name, caption.shortHash].filter((part) => part).join(" · ");
    const side = translate(MERGE_SIDE_TEXTS[caption.side]);
    return detail === "" ? side : `${side}: ${detail}`;
}
