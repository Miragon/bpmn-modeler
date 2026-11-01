/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "A form is either a form id or an external reference, not both.":
        "Ein Formular ist entweder eine Formular-ID oder eine externe Referenz, nicht beides.",
    "A property cannot depend on itself.": "Eine Eigenschaft kann nicht von sich selbst abhängen.",
    "A regular expression the value must match.":
        "Ein regulärer Ausdruck, dem der Wert entsprechen muss.",
    "Add Choice": "Option hinzufügen",
    "Add Condition": "Bedingung hinzufügen",
    "Add Group": "Gruppe hinzufügen",
    "Add a property for each field users fill in.":
        "Fügen Sie für jedes Feld, das Benutzer ausfüllen, eine Eigenschaft hinzu.",
    "Add an element type": "Elementtyp hinzufügen",
    "Add an element type…": "Elementtyp hinzufügen…",
    "Add it": "Hinzufügen",
    "Also set in the JSON: {keys}": "Außerdem im JSON festgelegt: {keys}",
    "Always written; users do not see the field.":
        "Wird immer geschrieben; Benutzer sehen das Feld nicht.",
    'Another property already has the id "{id}".':
        'Eine andere Eigenschaft hat bereits die ID "{id}".',
    "Applies to": "Gilt für",
    "Apply Template": "Vorlage anwenden",
    "Attribute": "Attribut",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Automatisierte Arbeit, ausgeführt von einem Java Delegate, einem Ausdruck oder einem externen Task",
    "Automated work carried out by a system": "Automatisierte Arbeit, ausgeführt von einem System",
    "BPMN attribute": "BPMN-Attribut",
    "Basics": "Grundeinstellungen",
    "Being edited in": "Wird bearbeitet in",
    "Called process": "Aufgerufener Prozess",
    "Camunda properties, templates and lint": "Camunda-Eigenschaften, Vorlagen und Linting",
    "Checked by default.": "Standardmäßig aktiviert.",
    "Child process": "Kindprozess",
    "Choice name": "Optionsname",
    "Choice value": "Optionswert",
    "Choices": "Optionen",
    "Choose a property": "Eigenschaft auswählen",
    "Clear search": "Suche zurücksetzen",
    "Close": "Schließen",
    "Collapse": "Einklappen",
    "Create an element template": "Elementvorlage erstellen",
    "Create template": "Vorlage erstellen",
    "Creates element": "Erzeugtes Element",
    "Delegate": "Delegate",
    "Delete group": "Gruppe löschen",
    "Delete property": "Eigenschaft löschen",
    "Design": "Entwurf",
    "Documentation link": "Dokumentationslink",
    "Duplicate property": "Eigenschaft duplizieren",
    "Editable": "Bearbeitbar",
    "Element Templates": "Elementvorlagen",
    "Element actions": "Elementaktionen",
    "Elements": "Elemente",
    "Engine": "Engine",
    "Engine-neutral modeling": "Engine-neutrale Modellierung",
    "Enter a number.": "Geben Sie eine Zahl ein.",
    "Event definition": "Ereignisdefinition",
    "Expand": "Ausklappen",
    "Extension property": "Erweiterungseigenschaft",
    "Favourites": "Favoriten",
    "Fix it in the JSON editor; until then the builder is read-only.":
        "Beheben Sie den Fehler im JSON-Editor; bis dahin ist der grafische Editor schreibgeschützt.",
    "Fixed value": "Fester Wert",
    "For example: Send mail": "Zum Beispiel: E-Mail senden",
    "Groups": "Gruppen",
    "Groups put properties under their own heading in the properties panel.":
        "Gruppen fassen Eigenschaften im Eigenschaften-Panel unter einer eigenen Überschrift zusammen.",
    "Help text below the field.": "Hilfetext unter dem Feld.",
    "Hide preview": "Vorschau ausblenden",
    "Human": "Mensch",
    "Implement": "Implementieren",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Für „Implementieren“ wird eine Camunda-Ausführungsplattform benötigt – dieses Modell hat keine. Weisen Sie eine zu, um es zu aktivieren.",
    "Is empty": "Ist leer",
    "Is one of": "Ist einer von",
    "Is shown": "Wird angezeigt",
    "Java delegate": "Java Delegate",
    "Leave the value out of the XML while it is empty.":
        "Lässt den Wert im XML weg, solange er leer ist.",
    "Lets conditions refer to this property.":
        "Damit können Bedingungen auf diese Eigenschaft verweisen.",
    "Linked from the template in the properties panel.":
        "Wird im Eigenschaften-Panel von der Vorlage aus verlinkt.",
    "Maximum length": "Maximale Länge",
    "Message subscription": "Nachrichtenabonnement",
    "Minimum length": "Minimale Länge",
    "Mode": "Modus",
    "Mode: {mode}": "Modus: {mode}",
    "Move down": "Nach unten verschieben",
    "Move up": "Nach oben verschieben",
    "Name or code": "Name oder Code",
    "No FEEL": "Kein FEEL",
    'No group has the id "{id}"; the property shows under "Custom properties".':
        'Keine Gruppe hat die ID "{id}"; die Eigenschaft wird unter "Benutzerdefinierte Eigenschaften" angezeigt.',
    "No groups match your search.": "Keine Gruppen entsprechen Ihrer Suche.",
    "No groups yet.": "Noch keine Gruppen.",
    "No matches in other models": "Keine Treffer in anderen Modellen",
    "No properties match your search.": "Keine Eigenschaften entsprechen Ihrer Suche.",
    "No properties yet.": "Noch keine Eigenschaften.",
    'No property has the id "{id}".': 'Keine Eigenschaft hat die ID "{id}".',
    "No settings match your search.": "Keine Einstellungen entsprechen Ihrer Suche.",
    "No templates found": "Keine Vorlagen gefunden",
    "No value": "Kein Wert",
    "No visible parameters": "Keine sichtbaren Parameter",
    "None": "Keine",
    "Operator": "Operator",
    "Optional": "Optional",
    "Other": "Sonstige",
    "Parts of the template": "Teile der Vorlage",
    "Pattern": "Muster",
    "Pattern message": "Fehlermeldung zum Muster",
    "Pick the engine and the element the template is for. You can change both later.":
        "Wählen Sie die Engine und das Element, für das die Vorlage gedacht ist. Sie können beides später ändern.",
    "Placeholder": "Platzhalter",
    "Placement": "Platzierung",
    "Preview": "Vorschau",
    "Problems": "Probleme",
    "Properties join the group with this id.":
        "Über diese ID werden Eigenschaften der Gruppe zugeordnet.",
    "Property": "Eigenschaft",
    "Raise it whenever you change a template that is in use.":
        "Erhöhen Sie sie jedes Mal, wenn Sie eine Vorlage ändern, die bereits verwendet wird.",
    "Read-only": "Schreibgeschützt",
    "Remove choice": "Option entfernen",
    "Remove condition": "Bedingung entfernen",
    "Remove {value}": "{value} entfernen",
    "Required": "Erforderlich",
    "Search failed": "Suche fehlgeschlagen",
    "Search groups": "Gruppen durchsuchen",
    "Search other models": "In anderen Modellen suchen",
    "Search properties": "Eigenschaften durchsuchen",
    "Search template settings": "Vorlageneinstellungen durchsuchen",
    "Search templates...": "Vorlagen suchen...",
    "Search...": "Suchen...",
    "Searching…": "Suche läuft…",
    "Select a template to see its details": "Wählen Sie eine Vorlage, um die Details anzuzeigen",
    "Set the element type": "Elementtyp festlegen",
    "Show": "Anzeigen",
    "Show only when": "Nur anzeigen, wenn",
    "Show preview": "Vorschau anzeigen",
    "Shown above the field.": "Wird über dem Feld angezeigt.",
    "Shown from the info icon next to the field.":
        "Wird über das Info-Symbol neben dem Feld angezeigt.",
    "Shown in the empty field.": "Wird im leeren Feld angezeigt.",
    "Shown when the value does not match the pattern.":
        "Wird angezeigt, wenn der Wert nicht dem Muster entspricht.",
    "Shown when users pick a template.": "Wird angezeigt, wenn Benutzer eine Vorlage auswählen.",
    "Shown with the name when users pick a template.":
        "Wird zusammen mit dem Namen angezeigt, wenn Benutzer eine Vorlage auswählen.",
    "Task Type": "Task-Typ",
    "Task header": "Task-Kopfzeile",
    "The JSON is invalid: {message}": "Das JSON ist ungültig: {message}",
    "The builder does not edit {binding} bindings yet; edit this one in JSON.":
        "Der grafische Editor bearbeitet {binding}-Bindungen noch nicht; bearbeiten Sie diese Bindung im JSON.",
    "The builder opens once the file holds a valid element template.":
        "Der grafische Editor öffnet sich, sobald die Datei eine gültige Elementvorlage enthält.",
    "The choice new elements start with.": "Die vorausgewählte Option für neue Elemente.",
    "The element it is applied to": "Das Element, auf das die Vorlage angewendet wird",
    "The elements users can apply the template to.":
        "Die Elemente, auf die Benutzer die Vorlage anwenden können.",
    'The engine decides which bindings the template can use. Your choice is saved as its "$schema".':
        'Die Engine bestimmt, welche Bindungen die Vorlage verwenden kann. Ihre Auswahl wird als "$schema" der Vorlage gespeichert.',
    "The event definition the created event gets.":
        "Die Ereignisdefinition, die das erzeugte Ereignis erhält.",
    "The fewest characters users may enter.":
        "Wie viele Zeichen Benutzer mindestens eingeben müssen.",
    "The field shows only while all these conditions hold.":
        "Das Feld wird nur angezeigt, solange alle diese Bedingungen erfüllt sind.",
    "The group the field appears in.": "Die Gruppe, in der das Feld erscheint.",
    "The group's heading in the properties panel.":
        "Die Überschrift der Gruppe im Eigenschaften-Panel.",
    "The kind of field users see.": "Die Art des Feldes, das Benutzer sehen.",
    "The most characters users may enter.": "Wie viele Zeichen Benutzer höchstens eingeben dürfen.",
    "The options users pick from.": "Die Optionen, aus denen Benutzer wählen.",
    "The preview shows the last template without errors.":
        "Die Vorschau zeigt die letzte fehlerfreie Vorlage.",
    "The template as the properties panel shows it. Values entered here are not saved.":
        "Die Vorlage, wie das Eigenschaften-Panel sie anzeigt. Hier eingegebene Werte werden nicht gespeichert.",
    'The template has no "$schema" that names its engine.':
        'Die Vorlage hat kein "$schema", das ihre Engine angibt.',
    "The value is FEEL": "Der Wert ist FEEL",
    "The value is an expression.": "Der Wert ist ein Ausdruck.",
    "The value must be one of the choices.": "Der Wert muss einer der Optionen entsprechen.",
    "The value new elements start with.": "Der Anfangswert für neue Elemente.",
    "This binding needs a zeebe:userTask property.":
        "Diese Bindung benötigt eine zeebe:userTask-Eigenschaft.",
    "This binding needs one of the element types {types}.":
        "Diese Bindung benötigt einen der Elementtypen {types}.",
    "This binding needs the called process id.":
        "Diese Bindung benötigt die ID des aufgerufenen Prozesses.",
    "This binding needs the decision id.": "Diese Bindung benötigt die Entscheidungs-ID.",
    "This binding needs the element type {type}.": "Diese Bindung benötigt den Elementtyp {type}.",
    "This binding needs the result variable.": "Diese Bindung benötigt die Ergebnisvariable.",
    "This binding needs the script expression.": "Diese Bindung benötigt den Skriptausdruck.",
    "This file does not contain an element template.": "Diese Datei enthält keine Elementvorlage.",
    "Tooltip": "Tooltip",
    "Try a different search term": "Versuchen Sie einen anderen Suchbegriff",
    "Turns the element into this type when the template is applied.":
        "Wandelt das Element beim Anwenden der Vorlage in diesen Typ um.",
    "Unique together with the version.": "Zusammen mit der Version eindeutig.",
    "Unlabeled property": "Eigenschaft ohne Label",
    "Unnamed": "Unbenannt",
    "Unnamed group": "Unbenannte Gruppe",
    "Untitled template": "Unbenannte Vorlage",
    "Users can change the value.": "Benutzer können den Wert ändern.",
    "Users may enter FEEL": "Benutzer dürfen FEEL eingeben",
    "Users must fill in a value.": "Benutzer müssen einen Wert eingeben.",
    "View": "Ansicht",
    "Where the value is written.": "Wohin der Wert geschrieben wird.",
    "Whether users may or must enter a FEEL expression.":
        "Ob Benutzer einen FEEL-Ausdruck eingeben dürfen oder müssen.",
    "Which engine is this template for?": "Für welche Engine ist diese Vorlage gedacht?",
    "a, b, c": "a, b, c",
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
