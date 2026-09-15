/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Apply Template": "Apply Template",
    "Being edited in": "Being edited in",
    "Clear search": "Clear search",
    "Close": "Close",
    "Collapse": "Collapse",
    "Delegate": "Delegate",
    "Design": "Design",
    "Element Templates": "Element Templates",
    "Element actions": "Element actions",
    "Expand": "Expand",
    "Favourites": "Favourites",
    "Implement": "Implement",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.",
    "Mode": "Mode",
    "No templates found": "No templates found",
    "No visible parameters": "No visible parameters",
    "Other": "Other",
    "Read-only": "Read-only",
    "Search templates...": "Search templates...",
    "Search...": "Search...",
    "Select a template to see its details": "Select a template to see its details",
    "Task Type": "Task Type",
    "Try a different search term": "Try a different search term",
    "Unnamed": "Unnamed",
    "View": "View",
    "double": "double",
    "integer": "integer",
    "optional": "optional",
    "read-only": "read-only",
    "required": "required",
    "{count} properties": "{count} properties",
    "{mode} — open properties panel": "{mode} — open properties panel",
};

export default dictionary;
