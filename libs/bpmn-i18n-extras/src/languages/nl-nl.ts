/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Being edited in": "Wordt bewerkt in",
    "Design": "Ontwerp",
    "Element actions": "Elementacties",
    "Implement": "Implementeren",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Voor Implementeren is een Camunda-uitvoeringsplatform nodig; dit model heeft er geen. Wijs er een toe om het in te schakelen.",
    "Mode": "Modus",
    "Read-only": "Alleen-lezen",
    "View": "Weergave",
    "{mode} — open properties panel": "{mode} — eigenschappenpaneel openen",
};

export default dictionary;
