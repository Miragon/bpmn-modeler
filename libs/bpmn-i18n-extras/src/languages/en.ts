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
    "Automated work carried out by a Java delegate, expression, or external task":
        "Automated work carried out by a Java delegate, expression, or external task",
    "Automated work carried out by a system": "Automated work carried out by a system",
    "Being edited in": "Being edited in",
    "Camunda properties, templates and lint": "Camunda properties, templates and lint",
    "Child process": "Child process",
    "Clear search": "Clear search",
    "Close": "Close",
    "Collapse": "Collapse",
    "Delegate": "Delegate",
    "Design": "Design",
    "Element Templates": "Element Templates",
    "Element actions": "Element actions",
    "Engine-neutral modeling": "Engine-neutral modeling",
    "Expand": "Expand",
    "Favourites": "Favourites",
    "Human": "Human",
    "Implement": "Implement",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.",
    "Java delegate": "Java delegate",
    "Mode": "Mode",
    "Mode: {mode}": "Mode: {mode}",
    "Name or code": "Name or code",
    "No matches in other models": "No matches in other models",
    "No templates found": "No templates found",
    "No visible parameters": "No visible parameters",
    "Other": "Other",
    "Read-only": "Read-only",
    "Search failed": "Search failed",
    "Search other models": "Search other models",
    "Search templates...": "Search templates...",
    "Search...": "Search...",
    "Searching…": "Searching…",
    "Select a template to see its details": "Select a template to see its details",
    "Task Type": "Task Type",
    "Try a different search term": "Try a different search term",
    "Unnamed": "Unnamed",
    "View": "View",
    "caught by {elements}": "caught by {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "optional",
    "read-only": "read-only",
    "required": "required",
    "thrown by {elements}": "thrown by {elements}",
    "{count} properties": "{count} properties",
    "{count} property": "{count} property",
};

export default dictionary;
