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
    "Automated work carried out by a Java delegate, expression, or external task":
        "Lavoro automatizzato svolto da un Java delegate, un'espressione o un'attività esterna",
    "Automated work carried out by a system": "Lavoro automatizzato svolto da un sistema",
    "Being edited in": "In modifica in",
    "Camunda properties, templates and lint": "Proprietà Camunda, modelli e linting",
    "Child process": "Processo figlio",
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
    "Human": "Umano",
    "Implement": "Implementa",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "«Implementa» richiede una piattaforma di esecuzione Camunda; questo modello non ne ha una. Assegnane una per abilitarla.",
    "Java delegate": "Java delegate",
    "Mode": "Modalità",
    "Mode: {mode}": "Modalità: {mode}",
    "Name or code": "Nome o codice",
    "No matches in other models": "Nessuna corrispondenza in altri modelli",
    "No templates found": "Nessun modello trovato",
    "No visible parameters": "Nessun parametro visibile",
    "Other": "Altri",
    "Read-only": "Sola lettura",
    "Search failed": "Ricerca non riuscita",
    "Search other models": "Cerca in altri modelli",
    "Search templates...": "Cerca modelli...",
    "Search...": "Cerca...",
    "Searching…": "Ricerca in corso…",
    "Select a template to see its details": "Seleziona un modello per visualizzarne i dettagli",
    "Task Type": "Tipo di attività",
    "Try a different search term": "Prova con un altro termine di ricerca",
    "Unnamed": "Senza nome",
    "View": "Visualizza",
    "caught by {elements}": "catturato da {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "opzionale",
    "read-only": "sola lettura",
    "required": "obbligatorio",
    "thrown by {elements}": "generato da {elements}",
    "{count} properties": "{count} proprietà",
};

export default dictionary;
