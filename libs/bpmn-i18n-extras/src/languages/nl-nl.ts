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
        "Een formulier is óf een form-ID óf een externe referentie, niet allebei.",
    "A property cannot depend on itself.": "Een eigenschap kan niet van zichzelf afhangen.",
    "A regular expression the value must match.":
        "Een reguliere expressie waaraan de waarde moet voldoen.",
    "Add Choice": "Voeg optie toe",
    "Add Condition": "Voeg conditie toe",
    "Add Group": "Voeg groep toe",
    "Add a property for each field users fill in.":
        "Voeg een eigenschap toe voor elk veld dat gebruikers invullen.",
    "Add an element type": "Voeg een elementtype toe",
    "Add an element type…": "Voeg een elementtype toe…",
    "Add it": "Voeg toe",
    "Also set in the JSON: {keys}": "Ook ingesteld in de JSON: {keys}",
    "Always written; users do not see the field.":
        "Wordt altijd geschreven; gebruikers zien het veld niet.",
    'Another property already has the id "{id}".': 'Een andere eigenschap heeft al het ID "{id}".',
    "Applies to": "Van toepassing op",
    "Apply Template": "Sjabloon toepassen",
    "Attribute": "Attribuut",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Geautomatiseerd werk dat door een Java delegate, expressie of external task wordt uitgevoerd",
    "Automated work carried out by a system":
        "Geautomatiseerd werk dat door een systeem wordt uitgevoerd",
    "BPMN attribute": "BPMN-attribuut",
    "Basics": "Basisinstellingen",
    "Being edited in": "Wordt bewerkt in",
    "Called process": "Aangeroepen proces",
    "Camunda properties, templates and lint": "Camunda-eigenschappen, sjablonen en linting",
    "Checked by default.": "Standaard aangevinkt.",
    "Child process": "Kindproces",
    "Choice name": "Naam van de optie",
    "Choice value": "Waarde van de optie",
    "Choices": "Opties",
    "Choose a property": "Kies een eigenschap",
    "Clear search": "Zoekopdracht wissen",
    "Close": "Sluiten",
    "Collapse": "Samenvouwen",
    "Create an element template": "Maak een element template",
    "Create template": "Maak template",
    "Creates element": "Aangemaakt element",
    "Delegate": "Delegate",
    "Delete group": "Verwijder groep",
    "Delete property": "Verwijder eigenschap",
    "Design": "Ontwerp",
    "Documentation link": "Documentatielink",
    "Duplicate property": "Dupliceer eigenschap",
    "Editable": "Bewerkbaar",
    "Element Templates": "Elementsjablonen",
    "Element actions": "Elementacties",
    "Elements": "Elementen",
    "Engine": "Engine",
    "Engine-neutral modeling": "Engine-neutraal modelleren",
    "Enter a number.": "Voer een getal in.",
    "Event definition": "Eventdefinitie",
    "Expand": "Uitvouwen",
    "Extension property": "Extension property",
    "Favourites": "Favorieten",
    "Fix it in the JSON editor; until then the builder is read-only.":
        "Los de fout op in de JSON-editor; tot die tijd is de grafische editor alleen-lezen.",
    "Fixed value": "Vaste waarde",
    "For example: Send mail": "Bijvoorbeeld: E-mail versturen",
    "Groups": "Groepen",
    "Groups put properties under their own heading in the properties panel.":
        "Groepen plaatsen eigenschappen onder een eigen kop in het eigenschappenpaneel.",
    "Help text below the field.": "Helptekst onder het veld.",
    "Hide preview": "Verberg voorbeeld",
    "Human": "Mens",
    "Implement": "Implementeren",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Voor Implementeren is een Camunda-uitvoeringsplatform nodig; dit model heeft er geen. Wijs er een toe om het in te schakelen.",
    "Is empty": "Is leeg",
    "Is one of": "Is een van",
    "Is shown": "Wordt getoond",
    "Java delegate": "Java delegate",
    "Leave the value out of the XML while it is empty.":
        "Laat de waarde weg uit de XML zolang die leeg is.",
    "Lets conditions refer to this property.":
        "Hiermee kunnen condities naar deze eigenschap verwijzen.",
    "Linked from the template in the properties panel.":
        "Wordt vanuit de template gelinkt in het eigenschappenpaneel.",
    "Maximum length": "Maximale lengte",
    "Message subscription": "Message subscription",
    "Minimum length": "Minimale lengte",
    "Mode": "Modus",
    "Mode: {mode}": "Modus: {mode}",
    "Move down": "Verplaats omlaag",
    "Move up": "Verplaats omhoog",
    "Name or code": "Naam of code",
    "No FEEL": "Geen FEEL",
    'No group has the id "{id}"; the property shows under "Custom properties".':
        'Geen enkele groep heeft het ID "{id}"; de eigenschap wordt getoond onder "Aangepaste eigenschappen".',
    "No groups match your search.": "Geen groepen komen overeen met je zoekopdracht.",
    "No groups yet.": "Nog geen groepen.",
    "No matches in other models": "Geen resultaten in andere modellen",
    "No properties match your search.": "Geen eigenschappen komen overeen met je zoekopdracht.",
    "No properties yet.": "Nog geen eigenschappen.",
    'No property has the id "{id}".': 'Geen enkele eigenschap heeft het ID "{id}".',
    "No settings match your search.": "Geen instellingen komen overeen met je zoekopdracht.",
    "No templates found": "Geen sjablonen gevonden",
    "No value": "Geen waarde",
    "No visible parameters": "Geen zichtbare parameters",
    "None": "Geen",
    "Operator": "Operator",
    "Optional": "Optioneel",
    "Other": "Overige",
    "Parts of the template": "Onderdelen van de template",
    "Pattern": "Patroon",
    "Pattern message": "Patroonmelding",
    "Pick the engine and the element the template is for. You can change both later.":
        "Kies de engine en het element waarvoor de template bedoeld is. Je kunt beide later wijzigen.",
    "Placeholder": "Placeholder",
    "Placement": "Plaatsing",
    "Preview": "Voorbeeld",
    "Problems": "Problemen",
    "Properties join the group with this id.":
        "Eigenschappen worden via dit ID aan de groep gekoppeld.",
    "Property": "Eigenschap",
    "Raise it whenever you change a template that is in use.":
        "Verhoog deze telkens wanneer je een template wijzigt die in gebruik is.",
    "Read-only": "Alleen-lezen",
    "Remove choice": "Verwijder optie",
    "Remove condition": "Verwijder conditie",
    "Remove {value}": "Verwijder {value}",
    "Required": "Verplicht",
    "Search failed": "Zoeken mislukt",
    "Search groups": "Zoek in groepen",
    "Search other models": "Zoeken in andere modellen",
    "Search properties": "Zoek in eigenschappen",
    "Search template settings": "Zoek in template-instellingen",
    "Search templates...": "Sjablonen zoeken...",
    "Search...": "Zoeken...",
    "Searching…": "Zoeken…",
    "Select a template to see its details": "Selecteer een sjabloon om de details te bekijken",
    "Set the element type": "Stel het elementtype in",
    "Show": "Toon",
    "Show only when": "Alleen tonen als",
    "Show preview": "Toon voorbeeld",
    "Shown above the field.": "Wordt boven het veld getoond.",
    "Shown from the info icon next to the field.":
        "Wordt getoond via het info-icoon naast het veld.",
    "Shown in the empty field.": "Wordt in het lege veld getoond.",
    "Shown when the value does not match the pattern.":
        "Wordt getoond als de waarde niet overeenkomt met het patroon.",
    "Shown when users pick a template.": "Wordt getoond als gebruikers een template kiezen.",
    "Shown with the name when users pick a template.":
        "Wordt samen met de naam getoond als gebruikers een template kiezen.",
    "Task Type": "Taaktype",
    "Task header": "Task header",
    "The JSON is invalid: {message}": "De JSON is ongeldig: {message}",
    "The builder does not edit {binding} bindings yet; edit this one in JSON.":
        "De grafische editor bewerkt {binding}-bindings nog niet; bewerk deze in de JSON.",
    "The builder opens once the file holds a valid element template.":
        "De grafische editor wordt geopend zodra het bestand een geldige element template bevat.",
    "The choice new elements start with.": "De vooraf geselecteerde optie voor nieuwe elementen.",
    "The element it is applied to": "Het element waarop de template wordt toegepast",
    "The elements users can apply the template to.":
        "De elementen waarop gebruikers de template kunnen toepassen.",
    'The engine decides which bindings the template can use. Your choice is saved as its "$schema".':
        'De engine bepaalt welke bindings de template kan gebruiken. Je keuze wordt opgeslagen als het "$schema" van de template.',
    "The event definition the created event gets.":
        "De eventdefinitie die het aangemaakte event krijgt.",
    "The fewest characters users may enter.":
        "Het minimale aantal tekens dat gebruikers moeten invoeren.",
    "The field shows only while all these conditions hold.":
        "Het veld wordt alleen getoond zolang aan al deze condities is voldaan.",
    "The group the field appears in.": "De groep waarin het veld verschijnt.",
    "The group's heading in the properties panel.":
        "De kop van de groep in het eigenschappenpaneel.",
    "The kind of field users see.": "Het soort veld dat gebruikers zien.",
    "The most characters users may enter.":
        "Het maximale aantal tekens dat gebruikers mogen invoeren.",
    "The options users pick from.": "De opties waaruit gebruikers kiezen.",
    "The preview shows the last template without errors.":
        "Het voorbeeld toont de laatste template zonder fouten.",
    "The template as the properties panel shows it. Values entered here are not saved.":
        "De template zoals het eigenschappenpaneel die toont. Hier ingevoerde waarden worden niet opgeslagen.",
    'The template has no "$schema" that names its engine.':
        'De template heeft geen "$schema" dat de engine aangeeft.',
    "The value is FEEL": "De waarde is FEEL",
    "The value is an expression.": "De waarde is een expressie.",
    "The value must be one of the choices.": "De waarde moet een van de opties zijn.",
    "The value new elements start with.": "De beginwaarde voor nieuwe elementen.",
    "This binding needs a zeebe:userTask property.":
        "Deze binding heeft een zeebe:userTask-eigenschap nodig.",
    "This binding needs one of the element types {types}.":
        "Deze binding heeft een van de elementtypen {types} nodig.",
    "This binding needs the called process id.":
        "Deze binding heeft het ID van het aangeroepen proces nodig.",
    "This binding needs the decision id.": "Deze binding heeft het ID van de decision nodig.",
    "This binding needs the element type {type}.":
        "Deze binding heeft het elementtype {type} nodig.",
    "This binding needs the result variable.": "Deze binding heeft de resultaatvariabele nodig.",
    "This binding needs the script expression.": "Deze binding heeft de scriptexpressie nodig.",
    "This file does not contain an element template.": "Dit bestand bevat geen element template.",
    "Tooltip": "Tooltip",
    "Try a different search term": "Probeer een andere zoekterm",
    "Turns the element into this type when the template is applied.":
        "Het element wordt omgezet naar dit type wanneer de template wordt toegepast.",
    "Unique together with the version.": "Uniek in combinatie met de versie.",
    "Unlabeled property": "Eigenschap zonder label",
    "Unnamed": "Naamloos",
    "Unnamed group": "Naamloze groep",
    "Untitled template": "Naamloze template",
    "Users can change the value.": "Gebruikers kunnen de waarde wijzigen.",
    "Users may enter FEEL": "Gebruikers mogen FEEL invoeren",
    "Users must fill in a value.": "Gebruikers moeten een waarde invullen.",
    "View": "Weergave",
    "Where the value is written.": "Waar de waarde naartoe wordt geschreven.",
    "Whether users may or must enter a FEEL expression.":
        "Of gebruikers een FEEL-expressie mogen of moeten invoeren.",
    "Which engine is this template for?": "Voor welke engine is deze template bedoeld?",
    "a, b, c": "a, b, c",
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
