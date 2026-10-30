/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Preview linked form": "Gekoppeld formulier bekijken",
    "Linked form preview": "Voorbeeld van gekoppeld formulier",
    "Refresh": "Vernieuwen",
    "Close form preview": "Formuliervoorbeeld sluiten",
    "Read-only preview of the saved local form.":
        "Alleen-lezenvoorbeeld van het opgeslagen lokale formulier.",
    "Saved form loaded.": "Opgeslagen formulier geladen.",
    "Open a workspace folder to preview linked forms.":
        "Open een werkruimtemap om gekoppelde formulieren te bekijken.",
    "No saved local form matches this reference. Refresh to try again.":
        "Geen opgeslagen lokaal formulier komt overeen met deze verwijzing. Vernieuw om opnieuw te proberen.",
    "Multiple saved forms match this reference. Choose a form to preview.":
        "Meerdere opgeslagen formulieren komen overeen met deze verwijzing. Kies een formulier.",
    "The saved form could not be read. Refresh to try again.":
        "Het opgeslagen formulier kon niet worden gelezen. Vernieuw om opnieuw te proberen.",
    "The host did not answer. Refresh to try again.":
        "De host heeft niet geantwoord. Vernieuw om opnieuw te proberen.",
    "The saved form is invalid or unsupported. Open it in the form editor.":
        "Het opgeslagen formulier is ongeldig of niet ondersteund. Open het in de formuliereditor.",
    "The form preview could not be loaded. Refresh to try again.":
        "Het formuliervoorbeeld kon niet worden geladen. Vernieuw om opnieuw te proberen.",
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
    "{count} property": "{count} eigenschap",
};

export default dictionary;
