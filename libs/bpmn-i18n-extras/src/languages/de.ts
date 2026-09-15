/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Apply Template": "Vorlage anwenden",
    "Being edited in": "Wird bearbeitet in",
    "Clear search": "Suche zurücksetzen",
    "Close": "Schließen",
    "Collapse": "Einklappen",
    "Delegate": "Delegate",
    "Design": "Entwurf",
    "Element Templates": "Elementvorlagen",
    "Element actions": "Elementaktionen",
    "Expand": "Ausklappen",
    "Favourites": "Favoriten",
    "Implement": "Implementieren",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Für „Implementieren“ wird eine Camunda-Ausführungsplattform benötigt – dieses Modell hat keine. Weisen Sie eine zu, um es zu aktivieren.",
    "Mode": "Modus",
    "No templates found": "Keine Vorlagen gefunden",
    "No visible parameters": "Keine sichtbaren Parameter",
    "Other": "Sonstige",
    "Read-only": "Schreibgeschützt",
    "Search templates...": "Vorlagen suchen...",
    "Search...": "Suchen...",
    "Select a template to see its details": "Wählen Sie eine Vorlage, um die Details anzuzeigen",
    "Task Type": "Task-Typ",
    "Try a different search term": "Versuchen Sie einen anderen Suchbegriff",
    "Unnamed": "Unbenannt",
    "View": "Ansicht",
    "double": "double",
    "integer": "integer",
    "optional": "optional",
    "read-only": "schreibgeschützt",
    "required": "erforderlich",
    "{count} properties": "{count} Eigenschaften",
    "{mode} — open properties panel": "{mode} – Eigenschaftenbereich öffnen",
};

export default dictionary;
