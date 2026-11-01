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
        "Un modulo usa un ID modulo o un riferimento esterno, non entrambi.",
    "A property cannot depend on itself.": "Una proprietà non può dipendere da sé stessa.",
    "A regular expression the value must match.":
        "Un'espressione regolare a cui il valore deve corrispondere.",
    "Add Choice": "Aggiungi opzione",
    "Add Condition": "Aggiungi condizione",
    "Add Group": "Aggiungi gruppo",
    "Add a property for each field users fill in.":
        "Aggiungi una proprietà per ogni campo che gli utenti compilano.",
    "Add an element type": "Aggiungi un tipo di elemento",
    "Add an element type…": "Aggiungi un tipo di elemento…",
    "Add it": "Aggiungi",
    "Also set in the JSON: {keys}": "Il JSON imposta anche: {keys}",
    "Always written; users do not see the field.":
        "Viene sempre scritto; gli utenti non vedono il campo.",
    'Another property already has the id "{id}".': "Un'altra proprietà ha già l'ID \"{id}\".",
    "Applies to": "Si applica a",
    "Apply Template": "Applica modello",
    "Attribute": "Attributo",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Lavoro automatizzato svolto da un Java delegate, un'espressione o un'attività esterna",
    "Automated work carried out by a system": "Lavoro automatizzato svolto da un sistema",
    "BPMN attribute": "Attributo BPMN",
    "Basics": "Informazioni di base",
    "Being edited in": "In modifica in",
    "Called process": "Processo chiamato",
    "Camunda properties, templates and lint": "Proprietà Camunda, modelli e linting",
    "Checked by default.": "Selezionato per impostazione predefinita.",
    "Child process": "Processo figlio",
    "Choice name": "Nome dell'opzione",
    "Choice value": "Valore dell'opzione",
    "Choices": "Opzioni",
    "Choose a property": "Scegli una proprietà",
    "Clear search": "Cancella ricerca",
    "Close": "Chiudi",
    "Collapse": "Comprimi",
    "Create an element template": "Crea un modello di elemento",
    "Create template": "Crea modello",
    "Creates element": "Elemento risultante",
    "Delegate": "Delegate",
    "Delete group": "Elimina gruppo",
    "Delete property": "Elimina proprietà",
    "Design": "Progettazione",
    "Documentation link": "Collegamento alla documentazione",
    "Duplicate property": "Duplica proprietà",
    "Editable": "Modificabile",
    "Element Templates": "Modelli di elemento",
    "Element actions": "Azioni elemento",
    "Elements": "Elementi",
    "Engine": "Motore",
    "Engine-neutral modeling": "Modellazione indipendente dal motore",
    "Enter a number.": "Inserisci un numero.",
    "Event definition": "Definizione di evento",
    "Expand": "Espandi",
    "Extension property": "Proprietà di estensione",
    "Favourites": "Preferiti",
    "Fix it in the JSON editor; until then the builder is read-only.":
        "Correggilo nell'editor JSON; fino ad allora l'editor visuale è di sola lettura.",
    "Fixed value": "Valore fisso",
    "For example: Send mail": "Ad esempio: Invia email",
    "Groups": "Gruppi",
    "Groups put properties under their own heading in the properties panel.":
        "I gruppi raccolgono le proprietà sotto un proprio titolo nel pannello delle proprietà.",
    "Help text below the field.": "Testo di aiuto sotto il campo.",
    "Hide preview": "Nascondi anteprima",
    "Human": "Umano",
    "Implement": "Implementa",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "«Implementa» richiede una piattaforma di esecuzione Camunda; questo modello non ne ha una. Assegnane una per abilitarla.",
    "Is empty": "È vuoto",
    "Is one of": "È uno di",
    "Is shown": "È visibile",
    "Java delegate": "Java delegate",
    "Leave the value out of the XML while it is empty.":
        "Non scrivere il valore nell'XML finché è vuoto.",
    "Lets conditions refer to this property.":
        "Consente alle condizioni di fare riferimento a questa proprietà.",
    "Linked from the template in the properties panel.":
        "Collegato dal modello nel pannello delle proprietà.",
    "Maximum length": "Lunghezza massima",
    "Message subscription": "Sottoscrizione del messaggio",
    "Minimum length": "Lunghezza minima",
    "Mode": "Modalità",
    "Mode: {mode}": "Modalità: {mode}",
    "Move down": "Sposta giù",
    "Move up": "Sposta su",
    "Name or code": "Nome o codice",
    "No FEEL": "Senza FEEL",
    'No group has the id "{id}"; the property shows under "Custom properties".':
        'Nessun gruppo ha l\'ID "{id}"; la proprietà appare sotto "Proprietà personalizzate".',
    "No groups match your search.": "Nessun gruppo corrisponde alla ricerca.",
    "No groups yet.": "Non ci sono ancora gruppi.",
    "No matches in other models": "Nessuna corrispondenza in altri modelli",
    "No properties match your search.": "Nessuna proprietà corrisponde alla ricerca.",
    "No properties yet.": "Non ci sono ancora proprietà.",
    'No property has the id "{id}".': 'Nessuna proprietà ha l\'ID "{id}".',
    "No settings match your search.": "Nessuna impostazione corrisponde alla ricerca.",
    "No templates found": "Nessun modello trovato",
    "No value": "Nessun valore",
    "No visible parameters": "Nessun parametro visibile",
    "None": "Nessuna",
    "Operator": "Operatore",
    "Optional": "Opzionale",
    "Other": "Altri",
    "Parts of the template": "Parti del modello",
    "Pattern": "Pattern",
    "Pattern message": "Messaggio del pattern",
    "Pick the engine and the element the template is for. You can change both later.":
        "Scegli il motore e l'elemento a cui è destinato il modello. Puoi cambiarli entrambi in seguito.",
    "Placeholder": "Segnaposto",
    "Placement": "Posizione",
    "Preview": "Anteprima",
    "Problems": "Problemi",
    "Properties join the group with this id.": "Le proprietà entrano nel gruppo tramite questo ID.",
    "Property": "Proprietà",
    "Raise it whenever you change a template that is in use.":
        "Aumentala ogni volta che modifichi un modello in uso.",
    "Read-only": "Sola lettura",
    "Remove choice": "Rimuovi opzione",
    "Remove condition": "Rimuovi condizione",
    "Remove {value}": "Rimuovi {value}",
    "Required": "Obbligatorio",
    "Search failed": "Ricerca non riuscita",
    "Search groups": "Cerca gruppi",
    "Search other models": "Cerca in altri modelli",
    "Search properties": "Cerca proprietà",
    "Search template settings": "Cerca impostazioni del modello",
    "Search templates...": "Cerca modelli...",
    "Search...": "Cerca...",
    "Searching…": "Ricerca in corso…",
    "Select a template to see its details": "Seleziona un modello per visualizzarne i dettagli",
    "Set the element type": "Imposta il tipo di elemento",
    "Show": "Mostra",
    "Show only when": "Mostra solo quando",
    "Show preview": "Mostra anteprima",
    "Shown above the field.": "Appare sopra il campo.",
    "Shown from the info icon next to the field.":
        "Appare tramite l'icona delle informazioni accanto al campo.",
    "Shown in the empty field.": "Appare nel campo vuoto.",
    "Shown when the value does not match the pattern.":
        "Appare quando il valore non corrisponde al pattern.",
    "Shown when users pick a template.": "Appare quando gli utenti scelgono un modello.",
    "Shown with the name when users pick a template.":
        "Appare insieme al nome quando gli utenti scelgono un modello.",
    "Task Type": "Tipo di attività",
    "Task header": "Intestazione attività",
    "The JSON is invalid: {message}": "Il JSON non è valido: {message}",
    "The builder does not edit {binding} bindings yet; edit this one in JSON.":
        "L'editor visuale non gestisce ancora i binding di tipo {binding}; modifica questo nel JSON.",
    "The builder opens once the file holds a valid element template.":
        "L'editor visuale si apre quando il file contiene un modello di elemento valido.",
    "The choice new elements start with.": "L'opzione iniziale dei nuovi elementi.",
    "The element it is applied to": "L'elemento a cui viene applicato",
    "The elements users can apply the template to.":
        "Gli elementi a cui gli utenti possono applicare il modello.",
    'The engine decides which bindings the template can use. Your choice is saved as its "$schema".':
        'Il motore determina quali binding può usare il modello. La tua scelta viene salvata come "$schema" del modello.',
    "The event definition the created event gets.":
        "La definizione di evento assegnata all'evento creato.",
    "The fewest characters users may enter.":
        "Il numero minimo di caratteri che gli utenti possono inserire.",
    "The field shows only while all these conditions hold.":
        "Il campo appare solo quando tutte queste condizioni sono soddisfatte.",
    "The group the field appears in.": "Il gruppo in cui appare il campo.",
    "The group's heading in the properties panel.":
        "Il titolo del gruppo nel pannello delle proprietà.",
    "The kind of field users see.": "Il tipo di campo che vedono gli utenti.",
    "The most characters users may enter.":
        "Il numero massimo di caratteri che gli utenti possono inserire.",
    "The options users pick from.": "Le opzioni tra cui scelgono gli utenti.",
    "The preview shows the last template without errors.":
        "L'anteprima mostra l'ultimo stato senza errori del modello.",
    "The template as the properties panel shows it. Values entered here are not saved.":
        "Il modello così come lo mostra il pannello delle proprietà. I valori inseriti qui non vengono salvati.",
    'The template has no "$schema" that names its engine.':
        'Il modello non ha uno "$schema" che ne indichi il motore.',
    "The value is FEEL": "Il valore è FEEL",
    "The value is an expression.": "Il valore è un'espressione.",
    "The value must be one of the choices.": "Il valore deve essere una delle opzioni.",
    "The value new elements start with.": "Il valore iniziale dei nuovi elementi.",
    "This binding needs a zeebe:userTask property.":
        "Questo binding richiede una proprietà zeebe:userTask.",
    "This binding needs one of the element types {types}.":
        "Questo binding richiede uno dei tipi di elemento {types}.",
    "This binding needs the called process id.":
        "Questo binding richiede l'ID del processo chiamato.",
    "This binding needs the decision id.": "Questo binding richiede l'ID della decisione.",
    "This binding needs the element type {type}.":
        "Questo binding richiede il tipo di elemento {type}.",
    "This binding needs the result variable.": "Questo binding richiede la variabile di risultato.",
    "This binding needs the script expression.":
        "Questo binding richiede l'espressione dello script.",
    "This file does not contain an element template.":
        "Questo file non contiene alcun modello di elemento.",
    "Tooltip": "Tooltip",
    "Try a different search term": "Prova con un altro termine di ricerca",
    "Turns the element into this type when the template is applied.":
        "Trasforma l'elemento in questo tipo quando si applica il modello.",
    "Unique together with the version.": "Univoco insieme alla versione.",
    "Unlabeled property": "Proprietà senza etichetta",
    "Unnamed": "Senza nome",
    "Unnamed group": "Gruppo senza nome",
    "Untitled template": "Modello senza titolo",
    "Users can change the value.": "Gli utenti possono modificare il valore.",
    "Users may enter FEEL": "Gli utenti possono inserire FEEL",
    "Users must fill in a value.": "Gli utenti devono inserire un valore.",
    "View": "Visualizza",
    "Where the value is written.": "Dove viene scritto il valore.",
    "Whether users may or must enter a FEEL expression.":
        "Se gli utenti possono o devono inserire un'espressione FEEL.",
    "Which engine is this template for?": "Per quale motore è questo modello?",
    "a, b, c": "a, b, c",
    "caught by {elements}": "catturato da {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "opzionale",
    "read-only": "sola lettura",
    "required": "obbligatorio",
    "thrown by {elements}": "generato da {elements}",
    "{count} properties": "{count} proprietà",
    "{count} property": "{count} proprietà",
};

export default dictionary;
