import { keepsEverythingInside, type MergePadDecision } from "../../domain/mergePadDecisions";
import { padIconSvg } from "./padIcon";

export type MergeDecisionGlyph = "keep" | "keepInside" | "leaveOut" | "keepRemovedFlows" | "undo";

export const MERGE_DECISION_ICONS: Readonly<Record<MergeDecisionGlyph, string>> = {
    keep: padIconSvg(`<path d="M20 6 9 17l-5-5"/>`),
    keepInside: padIconSvg(
        `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m16 9-5.5 6L8 12.5"/>`,
    ),
    leaveOut: padIconSvg(`<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>`),
    // A sequence flow's arrow and a plus: the flows come back.
    keepRemovedFlows: padIconSvg(
        `<path d="M3 12h10"/><path d="m10 8 4 4-4 4"/><path d="M19 9v6"/><path d="M16 12h6"/>`,
    ),
    undo: padIconSvg(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`),
};

export function mergeDecisionGlyph(decision: MergePadDecision): MergeDecisionGlyph {
    return keepsEverythingInside(decision) ? "keepInside" : decision.kind;
}
