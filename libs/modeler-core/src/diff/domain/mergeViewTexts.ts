import type { MergeRefusal } from "@miragon/bpmn-modeler-merge/domain";
import { ENGINE_LABEL, otherSide } from "@miragon/bpmn-modeler-types";

import { ActionNotice } from "../../kernel/domain/actionNotice";
import { ConflictReading, ResolvableStages } from "./conflictReading";

type StageName = keyof ResolvableStages;

/** Why the merge view does not open: a conflict reading other than resolvable, no file at all, or a stage the merge refuses. */
export type MergeViewRefusal =
    | Exclude<ConflictReading, { readonly kind: "resolvable" }>
    | { readonly kind: "noFile" }
    | MergeRefusal;

/** The command's title and the notice's action, which the host's manifest repeats. */
export const RESOLVE_IN_MERGE_VIEW_LABEL = "Resolve in BPMN Merge View";

const STAGE_TEXT: Record<StageName, string> = {
    base: "the common ancestor",
    current: "the current side",
    incoming: "the incoming side",
};

const REFUSAL_TEXT: {
    [K in MergeViewRefusal["kind"]]: (
        refusal: Extract<MergeViewRefusal, { kind: K }>,
        fileName: string,
    ) => string;
} = {
    notBpmn: (_refusal, fileName) =>
        `${fileName} is not a BPMN file. The BPMN merge view opens conflicted .bpmn files only.`,
    gitUnavailable: (_refusal, fileName) =>
        `The BPMN merge view cannot read the versions of ${fileName} from Git. Check that the Git extension is enabled.`,
    notConflicted: (_refusal, fileName) => `${fileName} has no merge conflict to resolve.`,
    oneSideDeleted: ({ remainingSide }, fileName) =>
        `${fileName} was deleted on the ${otherSide(remainingSide)} side and changed on the ${remainingSide} side. Keep or delete it in Source Control.`,
    oneSideAdded: ({ addedSide }, fileName) =>
        `${fileName} exists only on the ${addedSide} side. Keep or delete it in Source Control.`,
    bothDeleted: (_refusal, fileName) =>
        `${fileName} was deleted or renamed on both sides. Resolve it in Source Control.`,
    unparsable: ({ version, detail }, fileName) =>
        `The BPMN merge view cannot read ${STAGE_TEXT[version]} of ${fileName}: ${detail}. A file under Git LFS or a textconv driver hands Git's sides over as text that is not BPMN; resolve it in Source Control.`,
    parsesWithWarnings: ({ version, detail }, fileName) =>
        `The BPMN merge view cannot merge ${fileName}: ${STAGE_TEXT[version]} does not parse cleanly (${detail}). Resolve it in Source Control.`,
    mixedEngines: ({ current, incoming }, fileName) =>
        `The BPMN merge view cannot merge ${fileName}: ${STAGE_TEXT.current} is for ${ENGINE_LABEL[current]} and ${STAGE_TEXT.incoming} for ${ENGINE_LABEL[incoming]}, and a merge needs one engine. Resolve it in Source Control.`,
    elementWithoutId: ({ version, elementType }, fileName) =>
        `The BPMN merge view cannot merge ${fileName}: ${STAGE_TEXT[version]} holds a ${elementType} without an id, and the merge matches root elements and lanes by id. Resolve it in Source Control.`,
    noFile: () =>
        "Open a conflicted BPMN file, or select one in Source Control, to resolve it in the BPMN merge view.",
};

/** Explains why the merge view does not open a file. */
export function mergeViewRefusal(refusal: MergeViewRefusal, fileName: string): string {
    const text = REFUSAL_TEXT[refusal.kind] as (
        refusal: MergeViewRefusal,
        fileName: string,
    ) => string;
    return text(refusal, fileName);
}

/** Offered when a BPMN editor opens a file Git left its conflict markers in. */
export function conflictMarkerNotice(fileName: string): ActionNotice<"openMergeView"> {
    return {
        id: "conflictMarkers",
        tone: "warning",
        message: `${fileName} holds Git conflict markers, so the modeler cannot show it. Resolve the conflict in the BPMN merge view.`,
        actions: [{ label: RESOLVE_IN_MERGE_VIEW_LABEL, value: "openMergeView" }],
    };
}

/** The page of a merge pane whose merge view no longer exists, as after a window reload. */
export function mergeViewEndedText(): string {
    return "This merge view has ended. Open it again from Source Control.";
}

export function mergeViewFailedText(error: Error): string {
    return `Failed to open the BPMN merge view: ${error.message}`;
}
