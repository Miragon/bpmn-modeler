import { IMPLEMENTATION_LABELS } from "./templateProperties";

/** What a template list shows around its search, in the chooser and in the append menu. */
export const TEMPLATE_LIST_TEXTS = {
    clearSearch: "Clear search",
    allCategories: "All",
    noTemplates: "No templates found",
    noTemplatesHint: "Try a different search term",
} as const;

/** What a template's details show, in the chooser's preview and in the append menu's hover card. */
export const TEMPLATE_DETAIL_TEXTS = {
    documentation: "Documentation",
    properties: "Properties",
    inputParameters: "Input Parameters",
    outputParameters: "Output Parameters",
    noVisibleParameters: "No visible parameters",
    unnamedProperty: "Unnamed",
    required: "required",
    readOnly: "read-only",
    optional: "optional",
} as const;

export const CHOOSER_TEXTS = {
    title: "Element Templates",
    close: "Close",
    search: "Search templates...",
    oneProperty: "{count} property",
    manyProperties: "{count} properties",
    noSelection: "Select a template to see its details",
    apply: "Apply Template",
} as const;

/** Every key a template list and a template's details pass to translate(). */
export const TEMPLATE_KEYS: readonly string[] = [
    ...Object.values(TEMPLATE_LIST_TEXTS),
    ...Object.values(TEMPLATE_DETAIL_TEXTS),
    ...IMPLEMENTATION_LABELS,
];

/** Every key the chooser overlay passes to translate(). */
export const CHOOSER_KEYS: readonly string[] = [...Object.values(CHOOSER_TEXTS), ...TEMPLATE_KEYS];
