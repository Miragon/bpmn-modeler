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
        "Il modulo collegato è mancante o non valido. Controllare il riferimento al modulo.",
    "Preview linked form": "Visualizza anteprima del modulo collegato",
    "Fit diagram to view": "Adatta il diagramma alla vista",
    "Linked form preview": "Anteprima del modulo collegato",
    "Refresh": "Aggiorna",
    "Close form preview": "Chiudi anteprima del modulo",
    "Read-only preview of the saved local form.":
        "Anteprima di sola lettura del modulo locale salvato.",
    "Saved form loaded.": "Modulo salvato caricato.",
    "Open a workspace folder to preview linked forms.":
        "Apri una cartella di lavoro per visualizzare i moduli collegati.",
    "No saved local form matches this reference. Refresh to try again.":
        "Nessun modulo locale salvato corrisponde al riferimento. Aggiorna per riprovare.",
    "Multiple saved forms match this reference. Choose a form to preview.":
        "Più moduli salvati corrispondono al riferimento. Scegli un modulo da visualizzare.",
    "The saved form could not be read. Refresh to try again.":
        "Impossibile leggere il modulo salvato. Aggiorna per riprovare.",
    "The host did not answer. Refresh to try again.":
        "L’host non ha risposto. Aggiorna per riprovare.",
    "The saved form is invalid or unsupported. Open it in the form editor.":
        "Il modulo salvato non è valido o supportato. Aprilo nell’editor di moduli.",
    "The form preview could not be loaded. Refresh to try again.":
        "Impossibile caricare l’anteprima del modulo. Aggiorna per riprovare.",
    "Changes": "Modifiche",
    "No changes": "Nessuna modifica",
    "Show all": "Mostra tutto",
    "Show XML changes": "Mostra modifiche XML",
    "Old version": "Versione precedente",
    "New version": "Nuova versione",
    "Not in this version": "Non presente in questa versione",
    "It was removed. The version on the left shows it.":
        "È stato rimosso. La versione a sinistra lo mostra.",
    "It is new. The version on the right shows it.": "È nuovo. La versione a destra lo mostra.",
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
    "1 Error": "1 errore",
    "1 Warning": "1 avviso",
    "{count} Errors": "{count} errori",
    "{count} Warnings": "{count} avvisi",
    "{count} in {tab}": "{count} in {tab}",
    "{position} of {count}": "{position} di {count}",
    "{type}: no preview yet": "{type}: anteprima non ancora disponibile",
    "A Hidden property should have a value.": "Una proprietà nascosta dovrebbe avere un valore.",
    "Activity": "Attività",
    'Another group already has the id "{id}".': 'Un altro gruppo ha già l\'ID "{id}".',
    "Edit in the JSON for now": "Per ora da modificare nel JSON",
    "Enter an id.": "Inserisci un ID.",
    "For other element types": "Per altri tipi di elemento",
    "Optional on an input mapping is deprecated; from Camunda 8.8 an empty input mapping is null.":
        "Opzionale su una mappatura di input è deprecato; da Camunda 8.8 una mappatura di input vuota è null.",
    "Remove FEEL": "Rimuovi FEEL",
    "Remove Optional": "Rimuovi Opzionale",
    "Set the element type to {type}": "Imposta il tipo di elemento su {type}",
    "Templates for {type} cannot be previewed yet.":
        "I modelli per {type} non sono ancora visualizzabili in anteprima.",
    "This binding is deprecated; a task definition with the attribute type replaces it.":
        "Questo binding è deprecato; lo sostituisce una definizione di attività con l'attributo type.",
    "This binding only works on: {types}.": "Questo binding funziona solo su: {types}.",
    "This change was not written: the JSON around {path} is not what the builder expects. Fix it in the JSON editor.":
        "Questa modifica non è stata scritta: il JSON intorno a {path} non è quello che l'editor visuale si aspetta. Correggilo nell'editor JSON.",
    "Use the task definition": "Usa la definizione di attività",
    "Users cannot enter FEEL into a field they cannot edit.":
        "Gli utenti non possono inserire FEEL in un campo che non possono modificare.",
    "Generate from name": "Genera dal nome",
    "Review all IDs…": "Rivedi tutti gli ID…",
    "Rename the ID to {id}": "Rinomina l'ID in {id}",
    "The ID already follows the name.": "L'ID segue già il nome.",
    "Add a name to generate the ID from it.": "Aggiungi un nome per generarne l'ID.",
    "Current": "Corrente",
    "Incoming": "In ingresso",
    "your branch": "il tuo branch",
    "other branch": "altro branch",
    "your commit": "il tuo commit",
    "your stash": "il tuo stash",
    "Taken from this side": "Preso da questo lato",
    "Taken from the other side": "Preso dall'altro lato",
    "Conflict": "Conflitto",
    "Step through": "Scorri",
    "Open conflicts": "Conflitti aperti",
    "All merged elements": "Tutti gli elementi uniti",
    "No open conflicts": "Nessun conflitto aperto",
    "1 open conflict": "1 conflitto aperto",
    "{count} open conflicts": "{count} conflitti aperti",
    "Keep everything inside": "Mantieni tutto il contenuto",
    "Undo pick": "Annulla scelta",
    "Pulled in:": "Aggiunti:",
    "Dropped:": "Esclusi:",
    "Open again:": "Di nuovo aperti:",
    "Keep current": "Mantieni Corrente",
    "Keep incoming": "Mantieni In ingresso",
    "Kept from current, your pick": "Mantenuto da Corrente, scelta tua",
    "Kept from incoming, your pick": "Mantenuto da In ingresso, scelta tua",
    "Kept from current with everything inside, your pick":
        "Mantenuto da Corrente con tutto il contenuto, scelta tua",
    "Kept from incoming with everything inside, your pick":
        "Mantenuto da In ingresso con tutto il contenuto, scelta tua",
    "Kept from current with what was removed with it, your pick":
        "Mantenuto da Corrente con ciò che è stato rimosso con esso, scelta tua",
    "Kept from incoming with what was removed with it, your pick":
        "Mantenuto da In ingresso con ciò che è stato rimosso con esso, scelta tua",
    "Kept from current: {element}": "Mantenuto da Corrente: {element}",
    "Kept from incoming: {element}": "Mantenuto da In ingresso: {element}",
    "This pick brings in {element}, which needs {target}":
        "Questa scelta aggiunge {element}, che richiede {target}",
    "{element} and {target} hold the same ID": "{element} e {target} hanno lo stesso ID",
    "Also keep the flow current removed with it":
        "Mantieni anche il flusso rimosso con esso da Corrente",
    "Also keep the {count} flows current removed with it":
        "Mantieni anche i {count} flussi rimossi con esso da Corrente",
    "Also keep the flow incoming removed with it":
        "Mantieni anche il flusso rimosso con esso da In ingresso",
    "Also keep the {count} flows incoming removed with it":
        "Mantieni anche i {count} flussi rimossi con esso da In ingresso",
    "Also keep the boundary event current removed with it":
        "Mantieni anche l'evento di confine rimosso con esso da Corrente",
    "Also keep the {count} elements current removed with it":
        "Mantieni anche i {count} elementi rimossi con esso da Corrente",
    "Also keep the boundary event incoming removed with it":
        "Mantieni anche l'evento di confine rimosso con esso da In ingresso",
    "Also keep the {count} elements incoming removed with it":
        "Mantieni anche i {count} elementi rimossi con esso da In ingresso",
    "Took back the pick of {element}": "Scelta di {element} annullata",
    "Build": "Genera",
    "Notes of the build": "Note della generazione",
    "Compare with current": "Confronta con Corrente",
    "Compare with incoming": "Confronta con In ingresso",
    "Result against current": "Risultato rispetto a Corrente",
    "Result against incoming": "Risultato rispetto a In ingresso",
    "Result": "Risultato",
    "Review notes ({count})": "Controlla le note ({count})",
    "{element} does not meet {shapes}": "{element} non raggiunge {shapes}",
    "{first} and {second} lie on top of each other": "{first} e {second} sono uno sopra l'altro",
    "{element} runs through {shapes}": "{element} attraversa {shapes}",
    "{element} lies outside {shapes}": "{element} si trova fuori da {shapes}",
    "{element} is not on the border of {host}": "{element} non è sul bordo di {host}",
    "{first} and {second} overlap": "{first} e {second} si sovrappongono",
    "{element} is kept without the flows the other side removed with it: {connections}":
        "{element} è mantenuto senza i flussi che l'altro lato ha rimosso con esso: {connections}",
    "{element} is kept without the boundary event the other side removed with it: {elements}":
        "{element} è mantenuto senza l'evento di confine che l'altro lato ha rimosso con esso: {elements}",
    "{element} is kept without the {count} elements the other side removed with it: {elements}":
        "{element} è mantenuto senza i {count} elementi che l'altro lato ha rimosso con esso: {elements}",
    "{flow} is kept but is no longer the default flow of {element}":
        "{flow} è mantenuto, ma non è più il flusso predefinito di {element}",
    "{flow} is kept, but {element} keeps {keptDefault} as its default flow":
        "{flow} è mantenuto, ma {element} mantiene {keptDefault} come flusso predefinito",
    "The file's {attribute} differs between the sides; current's is kept":
        "L'attributo {attribute} del file differisce tra i lati; viene mantenuto quello di Corrente",
    "1 conflict left": "1 conflitto rimasto",
    "{count} conflicts left": "{count} conflitti rimasti",
    "Elements of this version the result keeps as they are here.":
        "Elementi di questa versione che il risultato mantiene così come sono qui.",
    "Elements of this version the result takes from the other version, or leaves out as the other version removed them.":
        "Elementi di questa versione che il risultato prende dall'altra versione, o lascia fuori perché l'altra versione li ha rimossi.",
    "Open conflicts on elements this version has.":
        "Conflitti aperti su elementi presenti in questa versione.",
    "Elements only the other version has are counted on the other pane only.":
        "Gli elementi presenti solo nell'altra versione sono contati solo nell'altro riquadro.",
    "More actions": "Altre azioni",
    "This step has no shape, so it is listed here.":
        "Questo passaggio non ha una forma, quindi è elencato qui.",
    "Not visible in the diagram ({count})": "Non visibili nel diagramma ({count})",
    "1 open conflict not visible in the diagram": "1 conflitto aperto non visibile nel diagramma",
    "{count} open conflicts not visible in the diagram":
        "{count} conflitti aperti non visibili nel diagramma",
    "Keep current with everything inside": "Mantieni Corrente con tutto il contenuto",
    "Keep incoming with everything inside": "Mantieni In ingresso con tutto il contenuto",
    "Leave out": "Lascia fuori",
    "Also keep what was removed with it": "Mantieni anche ciò che è stato rimosso con esso",
    "Keep it as current has it": "Mantienilo come lo ha Corrente",
    "Keep it as incoming has it": "Mantienilo come lo ha In ingresso",
    "Keep it and everything inside as current has them":
        "Mantienilo con tutto il contenuto come lo ha Corrente",
    "Keep it and everything inside as incoming has them":
        "Mantienilo con tutto il contenuto come lo ha In ingresso",
    "Keep it and every pool with its process as current has them":
        "Mantienilo con ogni pool e il suo processo come li ha Corrente",
    "Keep it and every pool with its process as incoming has them":
        "Mantienilo con ogni pool e il suo processo come li ha In ingresso",
    "Leave it out, as current removed it": "Lascialo fuori, perché Corrente lo ha rimosso",
    "Leave it out, as current doesn't have it": "Lascialo fuori, perché Corrente non lo ha",
    "Leave it out, as incoming removed it": "Lascialo fuori, perché In ingresso lo ha rimosso",
    "Leave it out, as incoming doesn't have it": "Lascialo fuori, perché In ingresso non lo ha",
    "Go back to what the merge decided by itself": "Torna a ciò che l'unione ha deciso da sola",
    "none": "nessun valore",
    "and other content": "e altro contenuto",
    "Removed in current": "Rimosso da Corrente",
    "Not in current": "Assente in Corrente",
    "Removed in incoming": "Rimosso da In ingresso",
    "Not in incoming": "Assente in In ingresso",
    "Kept from current with everything inside: {element}":
        "Mantenuto da Corrente con tutto il contenuto: {element}",
    "Kept from incoming with everything inside: {element}":
        "Mantenuto da In ingresso con tutto il contenuto: {element}",
    "Kept from current with what was removed with it: {element}":
        "Mantenuto da Corrente con ciò che è stato rimosso con esso: {element}",
    "Kept from incoming with what was removed with it: {element}":
        "Mantenuto da In ingresso con ciò che è stato rimosso con esso: {element}",
    "Left out: {element}, as current removed it":
        "Lasciato fuori: {element}, perché Corrente lo ha rimosso",
    "Left out: {element}, as current doesn't have it":
        "Lasciato fuori: {element}, perché Corrente non lo ha",
    "Left out: {element}, as incoming removed it":
        "Lasciato fuori: {element}, perché In ingresso lo ha rimosso",
    "Left out: {element}, as incoming doesn't have it":
        "Lasciato fuori: {element}, perché In ingresso non lo ha",
    "Took back the pick. {element} is an open conflict again.":
        "Scelta annullata. {element} è di nuovo un conflitto aperto.",
    "Can't keep {element}": "Impossibile mantenere {element}",
    "Can't leave out {element}": "Impossibile lasciare fuori {element}",
    "Can't take back the pick of {element}": "Impossibile annullare la scelta di {element}",
    "Nothing blocks keeping {element} now": "Ora niente impedisce di mantenere {element}",
    "Nothing blocks leaving out {element} now": "Ora niente impedisce di lasciare fuori {element}",
    "Nothing blocks taking back the pick of {element} now":
        "Ora niente impedisce di annullare la scelta di {element}",
    "{element} needs {target}; no version has it":
        "{element} richiede {target}; nessuna versione lo contiene",
    "{element} needs {target}; your pick takes a side without it":
        "{element} richiede {target}; la tua scelta prende un lato senza di esso",
    "{element} needs a part of {target}; your pick takes a side without it":
        "{element} richiede una parte di {target}; la tua scelta prende un lato senza di essa",
    "{element} needs {target}; this pick drops it":
        "{element} richiede {target}; questa scelta lo esclude",
    "{element} needs a part of {target} this pick leaves out":
        "{element} richiede una parte di {target} che questa scelta lascia fuori",
    "{element} needs {target}; this side lacks it":
        "{element} richiede {target}; questo lato non lo ha",
    "{element} needs a part of {target}; this side lacks it":
        "{element} richiede una parte di {target}; questo lato non la contiene",
    "{element} needs {target}; the result leaves it out":
        "{element} richiede {target}; il risultato lo lascia fuori",
    "{element} needs a part of {target} the kept version lacks":
        "{element} richiede una parte di {target} che manca nella versione mantenuta",
    "Your pick of {element} needs {target}": "La tua scelta di {element} richiede {target}",
    "{element} and {target} have a pool of the same process":
        "{element} e {target} hanno un pool dello stesso processo",
    "{element} needs it; no version has it": "{element} lo richiede; nessuna versione lo contiene",
    "{element} needs it; your pick takes a side without it":
        "{element} lo richiede; la tua scelta prende un lato senza di esso",
    "{element} needs a part of it; your pick takes a side without it":
        "{element} ne richiede una parte; la tua scelta prende un lato senza di essa",
    "{element} needs it": "{element} lo richiede",
    "{element} needs a part of it this pick leaves out":
        "{element} ne richiede una parte che questa scelta lascia fuori",
    "{element} needs it; this side lacks it": "{element} lo richiede; questo lato non lo ha",
    "{element} needs a part of it; this side lacks it":
        "{element} ne richiede una parte; questo lato non la contiene",
    "{element} needs a part of it the kept version lacks":
        "{element} ne richiede una parte che manca nella versione mantenuta",
    "Your pick of {element} needs it": "La tua scelta di {element} lo richiede",
    "This pick brings in {element}, which needs it":
        "Questa scelta aggiunge {element}, che lo richiede",
    "{element} holds the same ID": "{element} ha lo stesso ID",
    "{element} has a pool of the same process": "{element} ha un pool dello stesso processo",
    "and {count} more": "e altri {count}",
    "Data store": "Deposito dati",
    "Item definition": "Definizione di elemento",
    "Category": "Categoria",
    "Interface": "Interfaccia",
    "End point": "Endpoint",
    "Partner entity": "Entità partner",
    "Partner role": "Ruolo partner",
    "Correlation property": "Proprietà di correlazione",
    "Global task": "Attività globale",
    "Flow from {source} to {target}": "Flusso da {source} a {target}",
    "Both sides changed the layout of {elements}; current's is kept":
        "Entrambi i lati hanno cambiato il layout di {elements}; viene mantenuto quello di Corrente",
    "Both sides changed the layout of {elements}; incoming's is kept":
        "Entrambi i lati hanno cambiato il layout di {elements}; viene mantenuto quello di In ingresso",
    "by hand": "a mano",
    "Edit again": "Modifica di nuovo",
    "Keep my XML": "Mantieni il mio XML",
    "Keep the XML merged before": "Mantieni l'XML unito prima",
    "Merge XML": "Unisci XML",
    "Merge both sides' changes to its XML by hand in a merge editor":
        "Unisci a mano le modifiche di entrambi i lati al suo XML in un editor di merge",
    "Edit merged XML": "Modifica l'XML unito",
    "Change the XML you merged by hand": "Cambia l'XML che hai unito a mano",
    "Keep current's version": "Mantieni la versione di Corrente",
    "Keep incoming's version": "Mantieni la versione di In ingresso",
    "Drop it and pick": "Scartalo e scegli",
    "Drop it and leave out": "Scartalo e lascia fuori",
    "Drop it and undo": "Scartalo e annulla",
    "Kept from current and merged by hand, your pick":
        "Mantenuto da Corrente e unito a mano, scelta tua",
    "Kept from incoming and merged by hand, your pick":
        "Mantenuto da In ingresso e unito a mano, scelta tua",
    "Kept from current with everything inside and merged by hand, your pick":
        "Mantenuto da Corrente con tutto il contenuto e unito a mano, scelta tua",
    "Kept from incoming with everything inside and merged by hand, your pick":
        "Mantenuto da In ingresso con tutto il contenuto e unito a mano, scelta tua",
    "Kept from current with what was removed with it and merged by hand, your pick":
        "Mantenuto da Corrente con ciò che è stato rimosso con esso e unito a mano, scelta tua",
    "Kept from incoming with what was removed with it and merged by hand, your pick":
        "Mantenuto da In ingresso con ciò che è stato rimosso con esso e unito a mano, scelta tua",
    "Merged by hand: {element}": "Unito a mano: {element}",
    "Closed without saving: {element} is unchanged":
        "Chiuso senza salvare: {element} resta invariato",
    "This drops the XML you merged by hand for {elements}":
        "Questo scarta l'XML che hai unito a mano per {elements}",
    "The XML of {element} still holds conflict markers":
        "L'XML di {element} contiene ancora marcatori di conflitto",
    "The XML of {element} doesn't parse": "L'XML di {element} non è analizzabile",
    "The XML of {element} must hold one element":
        "L'XML di {element} deve contenere un solo elemento",
    "The XML of {element} changes its type": "L'XML di {element} cambia il suo tipo",
    "The XML of {element} changes its ID": "L'XML di {element} cambia il suo ID",
    "The XML of {element} holds elements of their own":
        "L'XML di {element} contiene elementi a sé stanti",
    "The XML of {element} goes beyond its own content":
        "L'XML di {element} va oltre il proprio contenuto",
    "The XML of {element} names an element of the wrong type":
        "L'XML di {element} nomina un elemento del tipo sbagliato",
    "The XML of {element} uses an unknown namespace":
        "L'XML di {element} usa un namespace sconosciuto",
    "The engine doesn't take the XML of {element}": "Il motore non accetta l'XML di {element}",
    "The XML of {element} changes what follows the pick":
        "L'XML di {element} cambia ciò che segue la scelta",
    "The XML of {element} names an element no version has":
        "L'XML di {element} nomina un elemento che nessuna versione ha",
    "The XML of {element} names an element the result leaves out":
        "L'XML di {element} nomina un elemento che il risultato lascia fuori",
    "The XML of {element} would change other decisions":
        "L'XML di {element} cambierebbe altre decisioni",
    "The pick of {element} changed while you merged it":
        "La scelta di {element} è cambiata mentre lo univi",
    "Resolve each conflict and remove its markers, then save.":
        "Risolvi ogni conflitto e rimuovi i suoi marcatori, poi salva.",
    "The parser says: {detail}": "Il parser dice: {detail}",
    "It holds {count} elements at its top level.":
        "Contiene {count} elementi al livello superiore.",
    "It is a {found} now; keep it a {expected}.": "Ora è un {found}; mantienilo come {expected}.",
    "Its ID is {found} now; keep {expected}.": "Il suo ID ora è {found}; mantieni {expected}.",
    "It has no ID now; keep {expected}.": "Ora non ha ID; mantieni {expected}.",
    "Merge these on their own, with a pick: {elements}":
        "Unisci questi separatamente, con una scelta: {elements}",
    "Only its attributes, documentation and extension elements merge here, not {properties}.":
        "Qui si uniscono solo i suoi attributi, la documentazione e gli elementi di estensione, non {properties}.",
    "{target} as {property}, which takes a {expected}":
        "{target} come {property}, che accetta un {expected}",
    "No version declares {namespaces}.": "Nessuna versione dichiara {namespaces}.",
    "The engine says: {detail}": "Il motore dice: {detail}",
    "{properties} follow the side you picked.": "{properties} seguono il lato che hai scelto.",
    "No version has {elements}.": "Nessuna versione ha {elements}.",
    "The result leaves out {elements}.": "Il risultato lascia fuori {elements}.",
    "It would change the decisions on {elements}.": "Cambierebbe le decisioni su {elements}.",
    "It is no longer picked on the side you merged it for.":
        "Non è più scelto sul lato per cui l'hai unito.",
};

export default dictionary;
