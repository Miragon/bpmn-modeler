import type {
    AddOnGroupPayload,
    AddOnPayload,
    GroupKindPayload,
} from "@miragon/bpmn-modeler-shared";

import { needsReview } from "./catalogFilter";
import { addOnsOf, Placement } from "./catalogQueries";

type GroupSection = "installed" | "marketplaces";

const SECTION_OF_GROUP: Readonly<Record<GroupKindPayload, GroupSection>> = {
    folder: "installed",
    marketplaces: "marketplaces",
};

/** The list from top to bottom; an add-on shows in one place only, so its id names one row. */
export interface ListSections {
    readonly attention: readonly Placement[];
    /** The folder groups, without the rows Needs attention took. */
    readonly installed: readonly AddOnGroupPayload[];
    /** Groups whose header the list leaves out: the only folder's sources stand directly under Installed. */
    readonly flatGroupIds: ReadonlySet<string>;
    readonly marketplaces?: AddOnGroupPayload;
}

/** Waits for the user's review, or does not work: read from what the core offers and says. */
export function needsAttention(addOn: AddOnPayload): boolean {
    return needsReview(addOn) || addOn.problem !== undefined;
}

export function sectionsOf(groups: readonly AddOnGroupPayload[]): ListSections {
    const attention = groups.flatMap((group) =>
        group.sources.flatMap((source) =>
            source.addOns.filter(needsAttention).map((addOn) => ({ group, source, addOn })),
        ),
    );
    const rest = groups.map(withoutAttention);
    const installed = rest.filter(({ kind }) => SECTION_OF_GROUP[kind] === "installed");
    const marketplaces = rest.find(({ kind }) => SECTION_OF_GROUP[kind] === "marketplaces");
    const listsSomething =
        marketplaces !== undefined &&
        (marketplaces.sources.length > 0 || marketplaces.problem !== undefined);
    return {
        attention,
        installed,
        flatGroupIds: new Set(installed.length === 1 ? [installed[0]!.id] : []),
        ...(listsSomething && { marketplaces }),
    };
}

export function displayOrderOf(sections: ListSections): string[] {
    return [
        ...sections.attention.map(({ addOn }) => addOn.id),
        ...addOnsOf(sectionGroupsOf(sections)).map(({ id }) => id),
    ];
}

/** The groups below Needs attention, in the order the list shows them. */
export function sectionGroupsOf(sections: ListSections): AddOnGroupPayload[] {
    return [...sections.installed, ...(sections.marketplaces ? [sections.marketplaces] : [])];
}

function withoutAttention(group: AddOnGroupPayload): AddOnGroupPayload {
    return {
        ...group,
        sources: group.sources.map((source) => ({
            ...source,
            addOns: source.addOns.filter((addOn) => !needsAttention(addOn)),
        })),
    };
}
