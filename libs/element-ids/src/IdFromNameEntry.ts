import { h } from "@bpmn-io/properties-panel/preact";

import type { DiagramElementLike } from "./candidates";
import type { ElementIdProposal } from "./ElementIdsService";
import type { Translate } from "./translate";

/** Props the provider puts on the entry; the panel spreads the whole entry onto the component. */
export interface IdFromNameEntryProps {
    readonly element: DiagramElementLike;
    readonly proposalFor: (element: DiagramElementLike) => ElementIdProposal | undefined;
    readonly renameFromName: (element: DiagramElementLike) => void;
    readonly openReview: () => void;
    readonly translate: Translate;
}

const DISABLED_REASONS: Readonly<Partial<Record<ElementIdProposal["status"] | "none", string>>> = {
    none: "Add a name to generate the ID from it.",
    skipped: "Add a name to generate the ID from it.",
    matches: "The ID already follows the name.",
};

/** "Generate from name · Review all IDs…" under the ID field; the panel's preact renders it. */
export function IdFromNameEntry({
    element,
    proposalFor,
    renameFromName,
    openReview,
    translate,
}: IdFromNameEntryProps) {
    const proposal = proposalFor(element);
    const disabledReason = DISABLED_REASONS[proposal?.status ?? "none"];
    return h(
        "div",
        { "class": "bio-properties-panel-entry eid-id-actions", "data-entry-id": "idFromName" },
        h(
            "button",
            {
                type: "button",
                class: "eid-link",
                disabled: disabledReason !== undefined,
                title: disabledReason
                    ? translate(disabledReason)
                    : translate("Rename the ID to {id}", { id: proposal?.newId ?? "" }),
                onClick: () => renameFromName(element),
            },
            translate("Generate from name"),
        ),
        h("span", { "class": "eid-separator", "aria-hidden": "true" }, "·"),
        h(
            "button",
            { type: "button", class: "eid-link", onClick: openReview },
            translate("Review all IDs…"),
        ),
    );
}
