import { elementTypeName } from "@miragon/bpmn-modeler-element-template-builder";
import type {
    MergeCaptionRole,
    MergeMarker,
    MergeSide,
    MergeSideCaption,
} from "@miragon/bpmn-modeler-types";

/** `i18n.translate`, with the replacements its templates name. */
export type MergeTranslate = (key: string, replacements?: Record<string, string>) => string;

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

/** What each marker means on the pane that shows it. */
export const MERGE_MARKER_LABELS: Readonly<Record<MergeMarker, string>> = {
    takenFromThisSide: "Taken from this side",
    takenFromOtherSide: "Taken from the other side",
    conflict: "Conflict",
};

/** The merge legend's own controls. */
export const MERGE_LEGEND_TEXTS = {
    stepList: "Step through",
    openConflictSteps: "Open conflicts",
    allSteps: "All merged elements",
    shapeless: "Without a shape",
    conflictBadge: "Conflict",
} as const;

/** The legend's count of the conflicts left to decide. */
export function openConflictsText(count: number, translate: MergeTranslate): string {
    if (count === 0) return translate("No open conflicts");
    if (count === 1) return translate("1 open conflict");
    return translate("{count} open conflicts", { count: String(count) });
}

/** A shape-less element's entry in the legend: its id and its type in words (`Data store`). */
export function shapelessEntryText(
    entry: { readonly id: string; readonly type: string },
    translate: MergeTranslate,
): string {
    return `${entry.id} (${elementTypeName(entry.type, translate)})`;
}
