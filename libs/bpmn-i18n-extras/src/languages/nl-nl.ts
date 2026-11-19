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
        "Het gekoppelde formulier ontbreekt of is ongeldig. Controleer de formulierverwijzing.",
    "Preview linked form": "Gekoppeld formulier bekijken",
    "Fit diagram to view": "Diagram passend maken",
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
    "Changes": "Wijzigingen",
    "No changes": "Geen wijzigingen",
    "Show all": "Alles tonen",
    "Show XML changes": "XML-wijzigingen tonen",
    "Old version": "Oude versie",
    "New version": "Nieuwe versie",
    "Not in this version": "Niet in deze versie",
    "It was removed. The version on the left shows it.":
        "Het is verwijderd. De versie links toont het.",
    "It is new. The version on the right shows it.": "Het is nieuw. De versie rechts toont het.",
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
    "1 Error": "1 fout",
    "1 Warning": "1 waarschuwing",
    "{count} Errors": "{count} fouten",
    "{count} Warnings": "{count} waarschuwingen",
    "{count} in {tab}": "{count} in {tab}",
    "{position} of {count}": "{position} van {count}",
    "{type}: no preview yet": "{type}: nog geen voorbeeld",
    "A Hidden property should have a value.":
        "Een verborgen eigenschap hoort een waarde te hebben.",
    "Activity": "Activiteit",
    'Another group already has the id "{id}".': 'Een andere groep heeft al het ID "{id}".',
    "Edit in the JSON for now": "Bewerk dit voorlopig in de JSON",
    "Enter an id.": "Voer een ID in.",
    "For other element types": "Voor andere elementtypen",
    "Optional on an input mapping is deprecated; from Camunda 8.8 an empty input mapping is null.":
        "Optioneel op een invoertoewijzing is verouderd; vanaf Camunda 8.8 is een lege invoertoewijzing null.",
    "Remove FEEL": "Verwijder FEEL",
    "Remove Optional": "Verwijder Optioneel",
    "Set the element type to {type}": "Stel het elementtype in op {type}",
    "Templates for {type} cannot be previewed yet.":
        "Templates voor {type} kunnen nog niet worden bekeken.",
    "This binding is deprecated; a task definition with the attribute type replaces it.":
        "Deze binding is verouderd; een taakdefinitie met het attribuut type vervangt deze.",
    "This binding only works on: {types}.": "Deze binding werkt alleen op: {types}.",
    "This change was not written: the JSON around {path} is not what the builder expects. Fix it in the JSON editor.":
        "Deze wijziging is niet geschreven: de JSON rond {path} is niet wat de grafische editor verwacht. Los dit op in de JSON-editor.",
    "Use the task definition": "Gebruik de taakdefinitie",
    "Users cannot enter FEEL into a field they cannot edit.":
        "Gebruikers kunnen geen FEEL invoeren in een veld dat ze niet kunnen bewerken.",
    "Generate from name": "Genereren uit naam",
    "Review all IDs…": "Alle ID's controleren…",
    "Rename the ID to {id}": "ID hernoemen naar {id}",
    "The ID already follows the name.": "De ID volgt de naam al.",
    "Add a name to generate the ID from it.": "Voeg een naam toe om er de ID uit te genereren.",
    "Current": "Huidig",
    "Incoming": "Inkomend",
    "your branch": "jouw branch",
    "other branch": "andere branch",
    "your commit": "jouw commit",
    "your stash": "jouw stash",
    "Taken from this side": "Overgenomen van deze kant",
    "Taken from the other side": "Overgenomen van de andere kant",
    "Conflict": "Conflict",
    "Step through": "Doorlopen",
    "Open conflicts": "Open conflicten",
    "All merged elements": "Alle samengevoegde elementen",
    "No open conflicts": "Geen open conflicten",
    "1 open conflict": "1 open conflict",
    "{count} open conflicts": "{count} open conflicten",
    "Keep everything inside": "Alles erin behouden",
    "Undo pick": "Keuze terugnemen",
    "Pulled in:": "Meegenomen:",
    "Dropped:": "Weggevallen:",
    "Open again:": "Weer open:",
    "Keep current": "Huidig behouden",
    "Keep incoming": "Inkomend behouden",
    "Kept from current, your pick": "Behouden van Huidig, jouw keuze",
    "Kept from incoming, your pick": "Behouden van Inkomend, jouw keuze",
    "Kept from current with everything inside, your pick":
        "Behouden van Huidig met alles erin, jouw keuze",
    "Kept from incoming with everything inside, your pick":
        "Behouden van Inkomend met alles erin, jouw keuze",
    "Kept from current with what was removed with it, your pick":
        "Behouden van Huidig met wat ermee verwijderd werd, jouw keuze",
    "Kept from incoming with what was removed with it, your pick":
        "Behouden van Inkomend met wat ermee verwijderd werd, jouw keuze",
    "Kept from current: {element}": "Behouden van Huidig: {element}",
    "Kept from incoming: {element}": "Behouden van Inkomend: {element}",
    "This pick brings in {element}, which needs {target}":
        "Deze keuze neemt {element} mee, dat {target} nodig heeft",
    "{element} and {target} hold the same ID": "{element} en {target} hebben hetzelfde ID",
    "Also keep the flow current removed with it":
        "Ook de flow behouden die Huidig ermee verwijderde",
    "Also keep the {count} flows current removed with it":
        "Ook de {count} flows behouden die Huidig ermee verwijderde",
    "Also keep the flow incoming removed with it":
        "Ook de flow behouden die Inkomend ermee verwijderde",
    "Also keep the {count} flows incoming removed with it":
        "Ook de {count} flows behouden die Inkomend ermee verwijderde",
    "Also keep the boundary event current removed with it":
        "Ook het boundary-event behouden dat Huidig ermee verwijderde",
    "Also keep the {count} elements current removed with it":
        "Ook de {count} elementen behouden die Huidig ermee verwijderde",
    "Also keep the boundary event incoming removed with it":
        "Ook het boundary-event behouden dat Inkomend ermee verwijderde",
    "Also keep the {count} elements incoming removed with it":
        "Ook de {count} elementen behouden die Inkomend ermee verwijderde",
    "Took back the pick of {element}": "Keuze voor {element} is teruggenomen",
    "Build": "Samenstellen",
    "Notes of the build": "Opmerkingen bij het samenstellen",
    "Compare with current": "Vergelijken met Huidig",
    "Compare with incoming": "Vergelijken met Inkomend",
    "Result against current": "Resultaat tegenover Huidig",
    "Result against incoming": "Resultaat tegenover Inkomend",
    "Result": "Resultaat",
    "Review notes ({count})": "Opmerkingen bekijken ({count})",
    "The build moved {element} to meet {shapes}":
        "Bij het samenstellen is {element} verplaatst zodat het aansluit op {shapes}",
    "{element} does not meet {shapes}; the build could not repair it":
        "{element} sluit niet aan op {shapes}; bij het samenstellen kon dit niet worden hersteld",
    "The build moved {element} off {shapes}":
        "Bij het samenstellen is {element} van {shapes} af verplaatst",
    "The build moved {element} off {shapes} and made room by shifting {shifted}":
        "Bij het samenstellen is {element} van {shapes} af verplaatst en ruimte gemaakt door {shifted} op te schuiven",
    "{first} and {second} lie on top of each other; the build could not repair it":
        "{first} en {second} liggen op elkaar; bij het samenstellen kon dit niet worden hersteld",
    "The build moved {element} around {shapes}":
        "Bij het samenstellen is {element} om {shapes} heen geleid",
    "{element} runs through {shapes}; the build could not repair it":
        "{element} loopt door {shapes}; bij het samenstellen kon dit niet worden hersteld",
    "{element} lies outside {shapes}": "{element} ligt buiten {shapes}",
    "{element} is not on the border of {host}": "{element} ligt niet op de rand van {host}",
    "{first} and {second} overlap": "{first} en {second} overlappen elkaar",
    "{element} is kept without the flows the other side removed with it: {connections}":
        "{element} is behouden zonder de flows die de andere kant ermee verwijderde: {connections}",
    "{element} is kept without the boundary event the other side removed with it: {elements}":
        "{element} is behouden zonder het boundary-event dat de andere kant ermee verwijderde: {elements}",
    "{element} is kept without the {count} elements the other side removed with it: {elements}":
        "{element} is behouden zonder de {count} elementen die de andere kant ermee verwijderde: {elements}",
    "{flow} is kept but is no longer the default flow of {element}":
        "{flow} is behouden, maar is niet langer de default-flow van {element}",
    "{flow} is kept, but {element} keeps {keptDefault} as its default flow":
        "{flow} is behouden, maar {element} houdt {keptDefault} als default-flow",
    "The file's {attribute} differs between the sides; current's is kept":
        "Het attribuut {attribute} van het bestand verschilt tussen de kanten; dat van Huidig blijft behouden",
    "{element} is left out of the drawing: no diagram shows both {source} and {target}":
        "{element} wordt niet getekend: geen diagram toont zowel {source} als {target}",
    "{element} is left out of the drawing: it lacks a source or a target":
        "{element} wordt niet getekend: er ontbreekt een bron of een doel",
    "1 conflict left": "Nog 1 conflict",
    "{count} conflicts left": "Nog {count} conflicten",
    "Elements of this version the result keeps as they are here.":
        "Elementen van deze versie die het resultaat behoudt zoals ze hier zijn.",
    "Elements of this version the result takes from the other version, or leaves out as the other version removed them.":
        "Elementen van deze versie die het resultaat van de andere versie overneemt, of weglaat omdat de andere versie ze verwijderde.",
    "Open conflicts on elements this version has.":
        "Open conflicten op elementen die deze versie heeft.",
    "Elements only the other version has are counted on the other pane only.":
        "Elementen die alleen de andere versie heeft, worden alleen in het andere paneel geteld.",
    "More actions": "Meer acties",
    "This step has no shape, so it is listed here.":
        "Deze stap heeft geen vorm en staat daarom hier.",
    "Not visible in the diagram ({count})": "Niet zichtbaar in het diagram ({count})",
    "1 open conflict not visible in the diagram": "1 open conflict niet zichtbaar in het diagram",
    "{count} open conflicts not visible in the diagram":
        "{count} open conflicten niet zichtbaar in het diagram",
    "Keep current with everything inside": "Huidig met alles erin behouden",
    "Keep incoming with everything inside": "Inkomend met alles erin behouden",
    "Leave out": "Weglaten",
    "Also keep what was removed with it": "Ook behouden wat ermee verwijderd werd",
    "Keep it as current has it": "Behouden zoals Huidig het heeft",
    "Keep it as incoming has it": "Behouden zoals Inkomend het heeft",
    "Keep it and everything inside as current has them":
        "Het en alles erin behouden zoals Huidig ze heeft",
    "Keep it and everything inside as incoming has them":
        "Het en alles erin behouden zoals Inkomend ze heeft",
    "Keep it and every pool with its process as current has them":
        "Het en elke pool met zijn proces behouden zoals Huidig ze heeft",
    "Keep it and every pool with its process as incoming has them":
        "Het en elke pool met zijn proces behouden zoals Inkomend ze heeft",
    "Leave it out, as current removed it": "Weglaten, omdat Huidig het verwijderde",
    "Leave it out, as current doesn't have it": "Weglaten, omdat Huidig het niet heeft",
    "Leave it out, as incoming removed it": "Weglaten, omdat Inkomend het verwijderde",
    "Leave it out, as incoming doesn't have it": "Weglaten, omdat Inkomend het niet heeft",
    "Go back to what the merge decided by itself":
        "Teruggaan naar wat de samenvoeging zelf besliste",
    "none": "geen waarde",
    "and other content": "en andere inhoud",
    "Removed in current": "Verwijderd in Huidig",
    "Not in current": "Niet in Huidig",
    "Removed in incoming": "Verwijderd in Inkomend",
    "Not in incoming": "Niet in Inkomend",
    "Kept from current with everything inside: {element}":
        "Behouden van Huidig met alles erin: {element}",
    "Kept from incoming with everything inside: {element}":
        "Behouden van Inkomend met alles erin: {element}",
    "Kept from current with what was removed with it: {element}":
        "Behouden van Huidig met wat ermee verwijderd werd: {element}",
    "Kept from incoming with what was removed with it: {element}":
        "Behouden van Inkomend met wat ermee verwijderd werd: {element}",
    "Left out: {element}, as current removed it":
        "Weggelaten: {element}, omdat Huidig het verwijderde",
    "Left out: {element}, as current doesn't have it":
        "Weggelaten: {element}, omdat Huidig het niet heeft",
    "Left out: {element}, as incoming removed it":
        "Weggelaten: {element}, omdat Inkomend het verwijderde",
    "Left out: {element}, as incoming doesn't have it":
        "Weggelaten: {element}, omdat Inkomend het niet heeft",
    "Took back the pick. {element} is an open conflict again.":
        "Keuze teruggenomen. {element} is weer een open conflict.",
    "Can't keep {element}": "{element} kan niet worden behouden",
    "Can't leave out {element}": "{element} kan niet worden weggelaten",
    "Can't take back the pick of {element}": "Keuze voor {element} kan niet worden teruggenomen",
    "Nothing blocks keeping {element} now": "Niets verhindert nu nog het behouden van {element}",
    "Nothing blocks leaving out {element} now":
        "Niets verhindert nu nog het weglaten van {element}",
    "Nothing blocks taking back the pick of {element} now":
        "Niets verhindert nu nog het terugnemen van de keuze voor {element}",
    "{element} needs {target}; no version has it":
        "{element} heeft {target} nodig; geen enkele versie heeft het",
    "{element} needs {target}; your pick takes a side without it":
        "{element} heeft {target} nodig; jouw keuze neemt een kant waar het ontbreekt",
    "{element} needs a part of {target}; your pick takes a side without it":
        "{element} heeft een deel van {target} nodig; jouw keuze neemt een kant waar het ontbreekt",
    "{element} needs {target}; this pick drops it":
        "{element} heeft {target} nodig; deze keuze laat het wegvallen",
    "{element} needs a part of {target} this pick leaves out":
        "{element} heeft een deel van {target} nodig dat deze keuze weglaat",
    "{element} needs {target}; this side lacks it":
        "{element} heeft {target} nodig; deze kant heeft het niet",
    "{element} needs a part of {target}; this side lacks it":
        "{element} heeft een deel van {target} nodig; deze kant heeft het niet",
    "{element} needs {target}; the result leaves it out":
        "{element} heeft {target} nodig; het resultaat laat het weg",
    "{element} needs a part of {target} the kept version lacks":
        "{element} heeft een deel van {target} nodig dat in de behouden versie ontbreekt",
    "Your pick of {element} needs {target}": "Jouw keuze voor {element} heeft {target} nodig",
    "{element} and {target} have a pool of the same process":
        "{element} en {target} hebben een pool van hetzelfde proces",
    "{element} needs it; no version has it":
        "{element} heeft het nodig; geen enkele versie heeft het",
    "{element} needs it; your pick takes a side without it":
        "{element} heeft het nodig; jouw keuze neemt een kant waar het ontbreekt",
    "{element} needs a part of it; your pick takes a side without it":
        "{element} heeft een deel ervan nodig; jouw keuze neemt een kant waar het ontbreekt",
    "{element} needs it": "{element} heeft het nodig",
    "{element} needs a part of it this pick leaves out":
        "{element} heeft een deel ervan nodig dat deze keuze weglaat",
    "{element} needs it; this side lacks it": "{element} heeft het nodig; deze kant heeft het niet",
    "{element} needs a part of it; this side lacks it":
        "{element} heeft een deel ervan nodig; deze kant heeft het niet",
    "{element} needs a part of it the kept version lacks":
        "{element} heeft een deel ervan nodig dat in de behouden versie ontbreekt",
    "Your pick of {element} needs it": "Jouw keuze voor {element} heeft het nodig",
    "This pick brings in {element}, which needs it":
        "Deze keuze neemt {element} mee, dat ervan afhankelijk is",
    "{element} holds the same ID": "{element} heeft hetzelfde ID",
    "{element} has a pool of the same process": "{element} heeft een pool van hetzelfde proces",
    "and {count} more": "en nog {count}",
    "Data store": "Datastore",
    "Item definition": "Itemdefinitie",
    "Category": "Categorie",
    "Interface": "Interface",
    "End point": "Endpoint",
    "Partner entity": "Partnerentiteit",
    "Partner role": "Partnerrol",
    "Correlation property": "Correlatie-eigenschap",
    "Global task": "Globale task",
    "Flow from {source} to {target}": "Flow van {source} naar {target}",
    "Both sides changed the layout of {elements}; current's is kept":
        "Beide kanten wijzigden de lay-out van {elements}; die van Huidig blijft behouden",
    "Both sides changed the layout of {elements}; incoming's is kept":
        "Beide kanten wijzigden de lay-out van {elements}; die van Inkomend blijft behouden",
    "by hand": "met de hand",
    "Edit again": "Opnieuw bewerken",
    "Keep my XML": "Mijn XML behouden",
    "Keep the XML merged before": "De eerder samengevoegde XML behouden",
    "Merge XML": "XML samenvoegen",
    "Merge both sides' changes to its XML by hand in a merge editor":
        "De wijzigingen van beide kanten aan de XML met de hand samenvoegen in een merge-editor",
    "Edit merged XML": "Samengevoegde XML bewerken",
    "Change the XML you merged by hand": "De met de hand samengevoegde XML wijzigen",
    "Keep current's version": "Versie van Huidig behouden",
    "Keep incoming's version": "Versie van Inkomend behouden",
    "Drop it and pick": "Verwerpen en kiezen",
    "Drop it and leave out": "Verwerpen en weglaten",
    "Drop it and undo": "Verwerpen en terugnemen",
    "Kept from current and merged by hand, your pick":
        "Behouden van Huidig en met de hand samengevoegd, jouw keuze",
    "Kept from incoming and merged by hand, your pick":
        "Behouden van Inkomend en met de hand samengevoegd, jouw keuze",
    "Kept from current with everything inside and merged by hand, your pick":
        "Behouden van Huidig met alles erin en met de hand samengevoegd, jouw keuze",
    "Kept from incoming with everything inside and merged by hand, your pick":
        "Behouden van Inkomend met alles erin en met de hand samengevoegd, jouw keuze",
    "Kept from current with what was removed with it and merged by hand, your pick":
        "Behouden van Huidig met wat ermee verwijderd werd en met de hand samengevoegd, jouw keuze",
    "Kept from incoming with what was removed with it and merged by hand, your pick":
        "Behouden van Inkomend met wat ermee verwijderd werd en met de hand samengevoegd, jouw keuze",
    "Merged by hand: {element}": "Met de hand samengevoegd: {element}",
    "Closed without saving: {element} is unchanged":
        "Gesloten zonder opslaan: {element} is ongewijzigd",
    "This drops the XML you merged by hand for {elements}":
        "Hiermee verwerp je de met de hand samengevoegde XML van {elements}",
    "The XML of {element} still holds conflict markers":
        "De XML van {element} bevat nog conflictmarkeringen",
    "The XML of {element} doesn't parse": "De XML van {element} is niet te parsen",
    "The XML of {element} must hold one element": "De XML van {element} moet één element bevatten",
    "The XML of {element} changes its type": "De XML van {element} wijzigt het type",
    "The XML of {element} changes its ID": "De XML van {element} wijzigt de ID",
    "The XML of {element} holds elements of their own":
        "De XML van {element} bevat zelfstandige elementen",
    "The XML of {element} goes beyond its own content":
        "De XML van {element} gaat verder dan de eigen inhoud",
    "The XML of {element} names an element of the wrong type":
        "De XML van {element} noemt een element van het verkeerde type",
    "The XML of {element} uses an unknown namespace":
        "De XML van {element} gebruikt een onbekende namespace",
    "The engine doesn't take the XML of {element}":
        "De engine accepteert de XML van {element} niet",
    "The XML of {element} changes what follows the pick":
        "De XML van {element} wijzigt wat de keuze volgt",
    "The XML of {element} names an element no version has":
        "De XML van {element} noemt een element dat geen versie heeft",
    "The XML of {element} names an element the result leaves out":
        "De XML van {element} noemt een element dat het resultaat weglaat",
    "The XML of {element} would change other decisions":
        "De XML van {element} zou andere beslissingen wijzigen",
    "The pick of {element} changed while you merged it":
        "De keuze voor {element} is gewijzigd terwijl je het samenvoegde",
    "Resolve each conflict and remove its markers, then save.":
        "Los elk conflict op, verwijder de markeringen en sla daarna op.",
    "The parser says: {detail}": "De parser meldt: {detail}",
    "It holds {count} elements at its top level.":
        "Het bevat {count} elementen op het hoogste niveau.",
    "It is a {found} now; keep it a {expected}.": "Het is nu een {found}; houd het een {expected}.",
    "Its ID is {found} now; keep {expected}.": "De ID is nu {found}; behoud {expected}.",
    "It has no ID now; keep {expected}.": "Het heeft nu geen ID; behoud {expected}.",
    "Merge these on their own, with a pick: {elements}":
        "Voeg deze apart samen, met een keuze: {elements}",
    "Only its attributes, documentation and extension elements merge here, not {properties}.":
        "Hier worden alleen de attributen, documentatie en extensie-elementen samengevoegd, niet {properties}.",
    "{target} as {property}, which takes a {expected}":
        "{target} als {property}, dat een {expected} verwacht",
    "No version declares {namespaces}.": "Geen versie declareert {namespaces}.",
    "The engine says: {detail}": "De engine meldt: {detail}",
    "{properties} follow the side you picked.": "{properties} volgen de gekozen kant.",
    "No version has {elements}.": "Geen versie heeft {elements}.",
    "The result leaves out {elements}.": "Het resultaat laat {elements} weg.",
    "It would change the decisions on {elements}.":
        "Het zou de beslissingen over {elements} wijzigen.",
    "It is no longer picked on the side you merged it for.":
        "Het is niet meer gekozen aan de kant waarvoor je het samenvoegde.",
};

export default dictionary;
