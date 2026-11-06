export type BuilderTab = "template" | "groups" | "properties";

/** The tabs that list items, each named after the template's list it shows. */
export type ItemTab = Exclude<BuilderTab, "template">;

export const BUILDER_TABS: readonly BuilderTab[] = ["template", "groups", "properties"];

/** Where the user is in the form. Rendering reads it; only {@link navigate} changes it. */
export interface BuilderNavigation {
    readonly tab: BuilderTab;
    /** The selected property or group, by its place in the template. */
    readonly property: number;
    readonly group: number;
    readonly query: string;
    readonly problemsOpen: boolean;
    /** An entry to focus once it exists; a field just added exists when its edit comes back. */
    readonly focus?: string;
    readonly scrollToTop: boolean;
}

export type NavigationEvent =
    /** The user switched the tab. */
    | { kind: "tab"; tab: BuilderTab }
    /** The form goes to an item, for example after adding or moving it. */
    | { kind: "open"; tab: "template" }
    | { kind: "open"; tab: ItemTab; index?: number; focus?: string }
    /** A problem's "Show": its field wins over what the search hides. */
    | { kind: "show"; tab: BuilderTab; index?: number; focus: string }
    | { kind: "search"; query: string }
    | { kind: "toggleProblems" }
    | { kind: "closeProblems" }
    /** The form has scrolled, and focused the entry if it exists. */
    | { kind: "arrived"; focused: boolean };

export function initialNavigation(propertyCount: number): BuilderNavigation {
    return {
        tab: propertyCount > 0 ? "properties" : "template",
        property: 0,
        group: 0,
        query: "",
        problemsOpen: false,
        scrollToTop: false,
    };
}

export function navigate(state: BuilderNavigation, event: NavigationEvent): BuilderNavigation {
    switch (event.kind) {
        case "tab":
            return { ...state, tab: event.tab, problemsOpen: false };
        case "open": {
            const focus = event.tab === "template" ? undefined : event.focus;
            return { ...withSelection(state, event), focus, scrollToTop: !focus };
        }
        case "show":
            return {
                ...withSelection(state, event),
                query: "",
                focus: event.focus,
                scrollToTop: false,
            };
        case "search":
            return { ...state, query: event.query };
        case "toggleProblems":
            return { ...state, problemsOpen: !state.problemsOpen };
        case "closeProblems":
            return { ...state, problemsOpen: false };
        case "arrived":
            return {
                ...state,
                focus: event.focused ? undefined : state.focus,
                scrollToTop: false,
            };
    }
}

function withSelection(
    state: BuilderNavigation,
    event: { tab: BuilderTab; index?: number },
): BuilderNavigation {
    const selected =
        event.index === undefined
            ? {}
            : event.tab === "properties"
              ? { property: event.index }
              : event.tab === "groups"
                ? { group: event.index }
                : {};
    return { ...state, tab: event.tab, ...selected };
}

/**
 * The item a tab shows: the selected one, as far as the template still has it
 * and the search still lets it through; else the first the search lets through.
 */
export function shownItem(
    selected: number,
    count: number,
    matching: readonly number[],
): number | undefined {
    const clamped = Math.min(selected, Math.max(count - 1, 0));
    return matching.includes(clamped) ? clamped : matching[0];
}
