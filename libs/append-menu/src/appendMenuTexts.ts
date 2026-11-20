// Deep import: the chooser barrel value-imports the DI module (and with it
// minisearch), which must stay out of the engine-neutral /design graph.
import { TEMPLATE_DETAIL_KEYS } from "@miragon/bpmn-modeler-element-template-chooser/chooserTexts";

export const APPEND_MENU_TEXTS = {
    search: "Search...",
    clearSearch: "Clear search",
    allCategories: "All",
    noTemplates: "No templates found",
    noTemplatesHint: "Try a different search term",
    paletteTitle: "BPMN",
    collapse: "Collapse",
    expand: "Expand",
    favourites: "Favourites",
    otherGroup: "Other",
} as const;

/** Every key the append menu passes to translate(), its template hover card included. */
export const APPEND_MENU_KEYS: readonly string[] = [
    ...Object.values(APPEND_MENU_TEXTS),
    ...TEMPLATE_DETAIL_KEYS,
];
