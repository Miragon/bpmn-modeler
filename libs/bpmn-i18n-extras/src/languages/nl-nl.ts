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
    "Automated work carried out by a Java delegate, expression, or external task":
        "Geautomatiseerd werk dat door een Java delegate, expressie of external task wordt uitgevoerd",
    "Automated work carried out by a system":
        "Geautomatiseerd werk dat door een systeem wordt uitgevoerd",
    "Being edited in": "Wordt bewerkt in",
    "Camunda properties, templates and lint": "Camunda-eigenschappen, sjablonen en linting",
    "Child process": "Kindproces",
    "Clear search": "Zoekopdracht wissen",
    "Close": "Sluiten",
    "Collapse": "Samenvouwen",
    "Delegate": "Delegate",
    "Design": "Ontwerp",
    "Element Templates": "Elementsjablonen",
    "Element actions": "Elementacties",
    "Engine-neutral modeling": "Engine-neutraal modelleren",
    "Expand": "Uitvouwen",
    "Favourites": "Favorieten",
    "Human": "Mens",
    "Implement": "Implementeren",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Voor Implementeren is een Camunda-uitvoeringsplatform nodig; dit model heeft er geen. Wijs er een toe om het in te schakelen.",
    "Java delegate": "Java delegate",
    "Mode": "Modus",
    "Mode: {mode}": "Modus: {mode}",
    "Name or code": "Naam of code",
    "No matches in other models": "Geen resultaten in andere modellen",
    "No templates found": "Geen sjablonen gevonden",
    "No visible parameters": "Geen zichtbare parameters",
    "Other": "Overige",
    "Read-only": "Alleen-lezen",
    "Search failed": "Zoeken mislukt",
    "Search other models": "Zoeken in andere modellen",
    "Search templates...": "Sjablonen zoeken...",
    "Search...": "Zoeken...",
    "Searching…": "Zoeken…",
    "Select a template to see its details": "Selecteer een sjabloon om de details te bekijken",
    "Task Type": "Taaktype",
    "Try a different search term": "Probeer een andere zoekterm",
    "Unnamed": "Naamloos",
    "View": "Weergave",
    "caught by {elements}": "opgevangen door {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "optioneel",
    "read-only": "alleen-lezen",
    "required": "verplicht",
    "thrown by {elements}": "gegooid door {elements}",
    "{count} properties": "{count} eigenschappen",
};

export default dictionary;
