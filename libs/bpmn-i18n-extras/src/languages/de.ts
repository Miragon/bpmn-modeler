/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "The linked form is missing or invalid. Check the form reference.":
        "Das verknüpfte Formular fehlt oder ist ungültig. Prüfen Sie den Formularverweis.",
    "Preview linked form": "Verknüpftes Formular vorschauen",
    "Linked form preview": "Vorschau des verknüpften Formulars",
    "Refresh": "Aktualisieren",
    "Close form preview": "Formularvorschau schließen",
    "Read-only preview of the saved local form.":
        "Schreibgeschützte Vorschau des gespeicherten lokalen Formulars.",
    "Saved form loaded.": "Gespeichertes Formular geladen.",
    "Open a workspace folder to preview linked forms.":
        "Öffnen Sie einen Arbeitsbereichsordner für die Formularvorschau.",
    "No saved local form matches this reference. Refresh to try again.":
        "Kein gespeichertes lokales Formular passt zu dieser Referenz. Aktualisieren Sie die Vorschau.",
    "Multiple saved forms match this reference. Choose a form to preview.":
        "Mehrere gespeicherte Formulare passen zu dieser Referenz. Wählen Sie ein Formular aus.",
    "The saved form could not be read. Refresh to try again.":
        "Das gespeicherte Formular konnte nicht gelesen werden. Aktualisieren Sie die Vorschau.",
    "The host did not answer. Refresh to try again.":
        "Der Host hat nicht geantwortet. Aktualisieren Sie die Vorschau.",
    "The saved form is invalid or unsupported. Open it in the form editor.":
        "Das gespeicherte Formular ist ungültig oder wird nicht unterstützt. Öffnen Sie es im Formulareditor.",
    "The form preview could not be loaded. Refresh to try again.":
        "Die Formularvorschau konnte nicht geladen werden. Aktualisieren Sie die Vorschau.",
    "Apply Template": "Vorlage anwenden",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Automatisierte Arbeit, ausgeführt von einem Java Delegate, einem Ausdruck oder einem externen Task",
    "Automated work carried out by a system": "Automatisierte Arbeit, ausgeführt von einem System",
    "Being edited in": "Wird bearbeitet in",
    "Camunda properties, templates and lint": "Camunda-Eigenschaften, Vorlagen und Linting",
    "Child process": "Kindprozess",
    "Clear search": "Suche zurücksetzen",
    "Close": "Schließen",
    "Collapse": "Einklappen",
    "Delegate": "Delegate",
    "Design": "Entwurf",
    "Element Templates": "Elementvorlagen",
    "Element actions": "Elementaktionen",
    "Engine-neutral modeling": "Engine-neutrale Modellierung",
    "Expand": "Ausklappen",
    "Favourites": "Favoriten",
    "Human": "Mensch",
    "Implement": "Implementieren",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Für „Implementieren“ wird eine Camunda-Ausführungsplattform benötigt – dieses Modell hat keine. Weisen Sie eine zu, um es zu aktivieren.",
    "Java delegate": "Java Delegate",
    "Mode": "Modus",
    "Mode: {mode}": "Modus: {mode}",
    "Name or code": "Name oder Code",
    "No matches in other models": "Keine Treffer in anderen Modellen",
    "No templates found": "Keine Vorlagen gefunden",
    "No visible parameters": "Keine sichtbaren Parameter",
    "Other": "Sonstige",
    "Read-only": "Schreibgeschützt",
    "Search failed": "Suche fehlgeschlagen",
    "Search other models": "In anderen Modellen suchen",
    "Search templates...": "Vorlagen suchen...",
    "Search...": "Suchen...",
    "Searching…": "Suche läuft…",
    "Select a template to see its details": "Wählen Sie eine Vorlage, um die Details anzuzeigen",
    "Task Type": "Task-Typ",
    "Try a different search term": "Versuchen Sie einen anderen Suchbegriff",
    "Unnamed": "Unbenannt",
    "View": "Ansicht",
    "caught by {elements}": "abgefangen von {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "optional",
    "read-only": "schreibgeschützt",
    "required": "erforderlich",
    "thrown by {elements}": "ausgelöst von {elements}",
    "{count} properties": "{count} Eigenschaften",
    "{count} property": "{count} Eigenschaft",
};

export default dictionary;
