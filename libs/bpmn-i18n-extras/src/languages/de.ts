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
    "Fit diagram to view": "Diagramm einpassen",
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
    "Changes": "Änderungen",
    "No changes": "Keine Änderungen",
    "Show all": "Alle anzeigen",
    "Show XML changes": "XML-Änderungen anzeigen",
    "Old version": "Alte Version",
    "New version": "Neue Version",
    "Not in this version": "Nicht in dieser Version",
    "It was removed. The version on the left shows it.":
        "Es wurde entfernt. Die Version links zeigt es.",
    "It is new. The version on the right shows it.": "Es ist neu. Die Version rechts zeigt es.",
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
    "1 Error": "1 Fehler",
    "1 Warning": "1 Warnung",
    "{count} Errors": "{count} Fehler",
    "{count} Warnings": "{count} Warnungen",
    "{count} in {tab}": "{count} in {tab}",
    "{position} of {count}": "{position} von {count}",
    "{type}: no preview yet": "{type}: noch keine Vorschau",
    "A Hidden property should have a value.":
        "Eine ausgeblendete Eigenschaft sollte einen Wert haben.",
    "Activity": "Aktivität",
    'Another group already has the id "{id}".': 'Eine andere Gruppe hat bereits die ID "{id}".',
    "Edit in the JSON for now": "Vorerst im JSON bearbeiten",
    "Enter an id.": "Geben Sie eine ID ein.",
    "For other element types": "Für andere Elementtypen",
    "Optional on an input mapping is deprecated; from Camunda 8.8 an empty input mapping is null.":
        "Optional bei einer Eingabezuordnung ist veraltet; ab Camunda 8.8 ist eine leere Eingabezuordnung null.",
    "Remove FEEL": "FEEL entfernen",
    "Remove Optional": "Optional entfernen",
    "Set the element type to {type}": "Elementtyp auf {type} setzen",
    "Templates for {type} cannot be previewed yet.":
        "Vorlagen für {type} können noch nicht in der Vorschau angezeigt werden.",
    "This binding is deprecated; a task definition with the attribute type replaces it.":
        "Diese Bindung ist veraltet; eine Aufgabendefinition mit dem Attribut type ersetzt sie.",
    "This binding only works on: {types}.": "Diese Bindung funktioniert nur auf: {types}.",
    "This change was not written: the JSON around {path} is not what the builder expects. Fix it in the JSON editor.":
        "Diese Änderung wurde nicht geschrieben: Das JSON um {path} entspricht nicht dem, was der grafische Editor erwartet. Beheben Sie das im JSON-Editor.",
    "Use the task definition": "Aufgabendefinition verwenden",
    "Users cannot enter FEEL into a field they cannot edit.":
        "In ein Feld, das Benutzer nicht bearbeiten können, können sie kein FEEL eingeben.",
    "Generate from name": "Aus Namen erzeugen",
    "Review all IDs…": "Alle IDs prüfen…",
    "Rename the ID to {id}": "ID in {id} umbenennen",
    "The ID already follows the name.": "Die ID folgt bereits dem Namen.",
    "Add a name to generate the ID from it.":
        "Geben Sie einen Namen ein, um die ID daraus zu erzeugen.",
    "Current": "Aktuell",
    "Incoming": "Eingehend",
    "your branch": "Ihr Branch",
    "other branch": "anderer Branch",
    "your commit": "Ihr Commit",
    "your stash": "Ihr Stash",
    "Taken from this side": "Von dieser Seite übernommen",
    "Taken from the other side": "Von der anderen Seite übernommen",
    "Conflict": "Konflikt",
    "Step through": "Durchgehen",
    "Open conflicts": "Offene Konflikte",
    "All merged elements": "Alle zusammengeführten Elemente",
    "No open conflicts": "Keine offenen Konflikte",
    "1 open conflict": "1 offener Konflikt",
    "{count} open conflicts": "{count} offene Konflikte",
    "Keep everything inside": "Alles darin behalten",
    "Undo pick": "Wahl zurücknehmen",
    "Pulled in:": "Hinzugenommen:",
    "Dropped:": "Entfallen:",
    "Open again:": "Wieder offen:",
    "Keep current": "Aktuell behalten",
    "Keep incoming": "Eingehend behalten",
    "Kept from current, your pick": "Von Aktuell behalten, Ihre Wahl",
    "Kept from incoming, your pick": "Von Eingehend behalten, Ihre Wahl",
    "Kept from current with everything inside, your pick":
        "Von Aktuell mit allem darin behalten, Ihre Wahl",
    "Kept from incoming with everything inside, your pick":
        "Von Eingehend mit allem darin behalten, Ihre Wahl",
    "Kept from current with its flows, your pick":
        "Von Aktuell mit seinen Flüssen behalten, Ihre Wahl",
    "Kept from incoming with its flows, your pick":
        "Von Eingehend mit seinen Flüssen behalten, Ihre Wahl",
    "Kept from current: {element}": "Von Aktuell behalten: {element}",
    "Kept from incoming: {element}": "Von Eingehend behalten: {element}",
    "This pick brings in {element}, which needs {target}":
        "Diese Wahl nimmt {element} hinzu, das {target} braucht",
    "{element} and {target} hold the same ID": "{element} und {target} haben dieselbe ID",
    "Also keep the flow current removed with it":
        "Auch den Fluss behalten, den Aktuell damit entfernt hat",
    "Also keep the {count} flows current removed with it":
        "Auch die {count} Flüsse behalten, die Aktuell damit entfernt hat",
    "Also keep the flow incoming removed with it":
        "Auch den Fluss behalten, den Eingehend damit entfernt hat",
    "Also keep the {count} flows incoming removed with it":
        "Auch die {count} Flüsse behalten, die Eingehend damit entfernt hat",
    "Took back the pick of {element}": "Wahl für {element} wurde zurückgenommen",
    "Build": "Erstellen",
    "Notes of the build": "Hinweise zur Erstellung",
    "Compare with current": "Mit Aktuell vergleichen",
    "Compare with incoming": "Mit Eingehend vergleichen",
    "Result against current": "Ergebnis gegen Aktuell",
    "Result against incoming": "Ergebnis gegen Eingehend",
    "Result": "Ergebnis",
    "Review notes ({count})": "Hinweise prüfen ({count})",
    "{element} connects shapes drawn by different sides; check where it meets {ends}":
        "{element} verbindet Formen, die verschiedene Seiten gezeichnet haben; prüfen Sie, wo es auf {ends} trifft",
    "{first} and {second} were added at the same place":
        "{first} und {second} wurden an derselben Stelle hinzugefügt",
    "{element} is drawn by another side than {containers}; check that it still sits inside":
        "{element} wurde von einer anderen Seite gezeichnet als {containers}; prüfen Sie, ob es noch darin liegt",
    "{element} is kept without the flows the other side removed with it: {connections}":
        "{element} wird ohne die Flüsse behalten, die die andere Seite damit entfernt hat: {connections}",
    "{flow} is kept but is no longer the default flow of {element}":
        "{flow} wird behalten, ist aber nicht mehr der Standardfluss von {element}",
    "{flow} is kept, but {element} keeps {keptDefault} as its default flow":
        "{flow} wird behalten, aber {element} behält {keptDefault} als Standardfluss",
    "The file's {attribute} differs between the sides; current's is kept":
        "Das Attribut {attribute} der Datei unterscheidet sich zwischen den Seiten; der Wert von Aktuell bleibt",
    "1 conflict left": "1 Konflikt übrig",
    "{count} conflicts left": "{count} Konflikte übrig",
    "Elements of this version the result keeps as they are here.":
        "Elemente dieser Version, die das Ergebnis so behält, wie sie hier sind.",
    "Elements of this version the result takes from the other version, or leaves out as the other version removed them.":
        "Elemente dieser Version, die das Ergebnis von der anderen Version übernimmt oder weglässt, weil die andere Version sie entfernt hat.",
    "Open conflicts on elements this version has.":
        "Offene Konflikte an Elementen, die diese Version hat.",
    "Elements only the other version has are counted on the other pane only.":
        "Elemente, die nur die andere Version hat, werden nur im anderen Bereich gezählt.",
    "More actions": "Weitere Aktionen",
    "This step has no shape, so it is listed here.":
        "Dieser Schritt hat keine Form und ist deshalb hier aufgeführt.",
    "Not visible in the diagram ({count})": "Im Diagramm nicht sichtbar ({count})",
    "1 open conflict not visible in the diagram": "1 offener Konflikt im Diagramm nicht sichtbar",
    "{count} open conflicts not visible in the diagram":
        "{count} offene Konflikte im Diagramm nicht sichtbar",
    "Keep current with everything inside": "Aktuell mit allem darin behalten",
    "Keep incoming with everything inside": "Eingehend mit allem darin behalten",
    "Leave out": "Weglassen",
    "Also keep its removed flows": "Auch seine entfernten Flüsse behalten",
    "Keep it as current has it": "Es so behalten, wie Aktuell es hat",
    "Keep it as incoming has it": "Es so behalten, wie Eingehend es hat",
    "Keep it and everything inside as current has them":
        "Es und alles darin so behalten, wie Aktuell sie hat",
    "Keep it and everything inside as incoming has them":
        "Es und alles darin so behalten, wie Eingehend sie hat",
    "Keep it and every pool with its process as current has them":
        "Es und jeden Pool mit seinem Prozess so behalten, wie Aktuell sie hat",
    "Keep it and every pool with its process as incoming has them":
        "Es und jeden Pool mit seinem Prozess so behalten, wie Eingehend sie hat",
    "Leave it out, as current removed it": "Weglassen, da Aktuell es entfernt hat",
    "Leave it out, as current doesn't have it": "Weglassen, da Aktuell es nicht hat",
    "Leave it out, as incoming removed it": "Weglassen, da Eingehend es entfernt hat",
    "Leave it out, as incoming doesn't have it": "Weglassen, da Eingehend es nicht hat",
    "Go back to what the merge decided by itself":
        "Zu dem zurückkehren, was die Zusammenführung selbst entschieden hat",
    "none": "kein Wert",
    "and other content": "und weitere Inhalte",
    "Removed in current": "In Aktuell entfernt",
    "Not in current": "Nicht in Aktuell",
    "Removed in incoming": "In Eingehend entfernt",
    "Not in incoming": "Nicht in Eingehend",
    "Kept from current with everything inside: {element}":
        "Von Aktuell mit allem darin behalten: {element}",
    "Kept from incoming with everything inside: {element}":
        "Von Eingehend mit allem darin behalten: {element}",
    "Kept from current with its flows: {element}":
        "Von Aktuell mit seinen Flüssen behalten: {element}",
    "Kept from incoming with its flows: {element}":
        "Von Eingehend mit seinen Flüssen behalten: {element}",
    "Left out: {element}, as current removed it":
        "Weggelassen: {element}, da Aktuell es entfernt hat",
    "Left out: {element}, as current doesn't have it":
        "Weggelassen: {element}, da Aktuell es nicht hat",
    "Left out: {element}, as incoming removed it":
        "Weggelassen: {element}, da Eingehend es entfernt hat",
    "Left out: {element}, as incoming doesn't have it":
        "Weggelassen: {element}, da Eingehend es nicht hat",
    "Took back the pick. {element} is an open conflict again.":
        "Wahl zurückgenommen. {element} ist wieder ein offener Konflikt.",
    "Can't keep {element}": "{element} kann nicht behalten werden",
    "Can't leave out {element}": "{element} kann nicht weggelassen werden",
    "Can't take back the pick of {element}": "Wahl für {element} kann nicht zurückgenommen werden",
    "Nothing blocks keeping {element} now": "Nichts verhindert jetzt mehr, {element} zu behalten",
    "Nothing blocks leaving out {element} now":
        "Nichts verhindert jetzt mehr, {element} wegzulassen",
    "Nothing blocks taking back the pick of {element} now":
        "Nichts verhindert jetzt mehr, die Wahl für {element} zurückzunehmen",
    "{element} needs {target}; no version has it":
        "{element} braucht {target}; keine Version hat es",
    "{element} needs {target}; your pick takes a side without it":
        "{element} braucht {target}; Ihre Wahl übernimmt eine Seite, der es fehlt",
    "{element} needs a part of {target}; your pick takes a side without it":
        "{element} braucht einen Teil von {target}; Ihre Wahl übernimmt eine Seite, der er fehlt",
    "{element} needs {target}; this pick drops it":
        "{element} braucht {target}; diese Wahl entfernt es",
    "{element} needs a part of {target} this pick leaves out":
        "{element} braucht einen Teil von {target}, den diese Wahl weglässt",
    "{element} needs {target}; this side lacks it":
        "{element} braucht {target}; diese Seite hat es nicht",
    "{element} needs a part of {target}; this side lacks it":
        "{element} braucht einen Teil von {target}; diese Seite hat ihn nicht",
    "{element} needs {target}; the result leaves it out":
        "{element} braucht {target}; das Ergebnis lässt es weg",
    "{element} needs a part of {target} the kept version lacks":
        "{element} braucht einen Teil von {target}, der in der behaltenen Version fehlt",
    "Your pick of {element} needs {target}": "Ihre Wahl für {element} braucht {target}",
    "{element} and {target} have a pool of the same process":
        "{element} und {target} haben einen Pool desselben Prozesses",
    "{element} needs it; no version has it": "{element} braucht es; keine Version hat es",
    "{element} needs it; your pick takes a side without it":
        "{element} braucht es; Ihre Wahl übernimmt eine Seite, der es fehlt",
    "{element} needs a part of it; your pick takes a side without it":
        "{element} braucht einen Teil davon; Ihre Wahl übernimmt eine Seite, der er fehlt",
    "{element} needs it": "{element} braucht es",
    "{element} needs a part of it this pick leaves out":
        "{element} braucht einen Teil davon, den diese Wahl weglässt",
    "{element} needs it; this side lacks it": "{element} braucht es; diese Seite hat es nicht",
    "{element} needs a part of it; this side lacks it":
        "{element} braucht einen Teil davon; diese Seite hat ihn nicht",
    "{element} needs a part of it the kept version lacks":
        "{element} braucht einen Teil davon, der in der behaltenen Version fehlt",
    "Your pick of {element} needs it": "Ihre Wahl für {element} braucht es",
    "This pick brings in {element}, which needs it":
        "Diese Wahl nimmt {element} hinzu, das darauf angewiesen ist",
    "{element} holds the same ID": "{element} hat dieselbe ID",
    "{element} has a pool of the same process": "{element} hat einen Pool desselben Prozesses",
    "and {count} more": "und {count} weitere",
    "Data store": "Datenspeicher",
    "Item definition": "Item-Definition",
    "Category": "Kategorie",
    "Interface": "Schnittstelle",
    "End point": "Endpunkt",
    "Partner entity": "Partner-Entität",
    "Partner role": "Partnerrolle",
    "Correlation property": "Korrelationseigenschaft",
    "Global task": "Globale Aufgabe",
    "Flow from {source} to {target}": "Fluss von {source} nach {target}",
    "Both sides changed the layout of {elements}; current's is kept":
        "Beide Seiten haben das Layout von {elements} geändert; das von Aktuell bleibt",
    "Both sides changed the layout of {elements}; incoming's is kept":
        "Beide Seiten haben das Layout von {elements} geändert; das von Eingehend bleibt",
};

export default dictionary;
