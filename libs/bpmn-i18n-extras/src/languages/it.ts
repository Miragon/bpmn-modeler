/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Apply Template": "Applica modello",
    "Being edited in": "In modifica in",
    "Camunda properties, templates and lint": "Proprietà Camunda, modelli e linting",
    "Clear search": "Cancella ricerca",
    "Close": "Chiudi",
    "Collapse": "Comprimi",
    "Delegate": "Delegate",
    "Design": "Progettazione",
    "Element Templates": "Modelli di elemento",
    "Element actions": "Azioni elemento",
    "Engine-neutral modeling": "Modellazione indipendente dal motore",
    "Expand": "Espandi",
    "Favourites": "Preferiti",
    "Implement": "Implementa",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "«Implementa» richiede una piattaforma di esecuzione Camunda; questo modello non ne ha una. Assegnane una per abilitarla.",
    "Mode": "Modalità",
    "Mode: {mode}": "Modalità: {mode}",
    "No templates found": "Nessun modello trovato",
    "No visible parameters": "Nessun parametro visibile",
    "Other": "Altri",
    "Read-only": "Sola lettura",
    "Search templates...": "Cerca modelli...",
    "Search...": "Cerca...",
    "Select a template to see its details": "Seleziona un modello per visualizzarne i dettagli",
    "Task Type": "Tipo di attività",
    "Try a different search term": "Prova con un altro termine di ricerca",
    "Unnamed": "Senza nome",
    "View": "Visualizza",
    "double": "double",
    "integer": "integer",
    "optional": "opzionale",
    "read-only": "sola lettura",
    "required": "obbligatorio",
    "{count} properties": "{count} proprietà",
};

export default dictionary;
