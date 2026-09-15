/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Apply Template": "Sjabloon toepassen",
    "Being edited in": "Wordt bewerkt in",
    "Clear search": "Zoekopdracht wissen",
    "Close": "Sluiten",
    "Collapse": "Samenvouwen",
    "Delegate": "Delegate",
    "Design": "Ontwerp",
    "Element Templates": "Elementsjablonen",
    "Element actions": "Elementacties",
    "Expand": "Uitvouwen",
    "Favourites": "Favorieten",
    "Implement": "Implementeren",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Voor Implementeren is een Camunda-uitvoeringsplatform nodig; dit model heeft er geen. Wijs er een toe om het in te schakelen.",
    "Mode": "Modus",
    "No templates found": "Geen sjablonen gevonden",
    "No visible parameters": "Geen zichtbare parameters",
    "Other": "Overige",
    "Read-only": "Alleen-lezen",
    "Search templates...": "Sjablonen zoeken...",
    "Search...": "Zoeken...",
    "Select a template to see its details": "Selecteer een sjabloon om de details te bekijken",
    "Task Type": "Taaktype",
    "Try a different search term": "Probeer een andere zoekterm",
    "Unnamed": "Naamloos",
    "View": "Weergave",
    "double": "double",
    "integer": "integer",
    "optional": "optioneel",
    "read-only": "alleen-lezen",
    "required": "verplicht",
    "{count} properties": "{count} eigenschappen",
    "{mode} — open properties panel": "{mode} — eigenschappenpaneel openen",
};

export default dictionary;
