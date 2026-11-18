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
        "Le formulaire lié est introuvable ou invalide. Vérifiez la référence au formulaire.",
    "Preview linked form": "Prévisualiser le formulaire lié",
    "Fit diagram to view": "Ajuster le diagramme à la vue",
    "Linked form preview": "Aperçu du formulaire lié",
    "Refresh": "Actualiser",
    "Close form preview": "Fermer l’aperçu du formulaire",
    "Read-only preview of the saved local form.":
        "Aperçu en lecture seule du formulaire local enregistré.",
    "Saved form loaded.": "Formulaire enregistré chargé.",
    "Open a workspace folder to preview linked forms.":
        "Ouvrez un dossier de travail pour prévisualiser les formulaires liés.",
    "No saved local form matches this reference. Refresh to try again.":
        "Aucun formulaire local enregistré ne correspond à cette référence. Actualisez pour réessayer.",
    "Multiple saved forms match this reference. Choose a form to preview.":
        "Plusieurs formulaires enregistrés correspondent à cette référence. Choisissez-en un.",
    "The saved form could not be read. Refresh to try again.":
        "Impossible de lire le formulaire enregistré. Actualisez pour réessayer.",
    "The host did not answer. Refresh to try again.":
        "L’hôte n’a pas répondu. Actualisez pour réessayer.",
    "The saved form is invalid or unsupported. Open it in the form editor.":
        "Le formulaire enregistré est invalide ou non pris en charge. Ouvrez-le dans l’éditeur de formulaires.",
    "The form preview could not be loaded. Refresh to try again.":
        "Impossible de charger l’aperçu du formulaire. Actualisez pour réessayer.",
    "Changes": "Modifications",
    "No changes": "Aucune modification",
    "Show all": "Tout afficher",
    "Show XML changes": "Afficher les modifications XML",
    "Old version": "Ancienne version",
    "New version": "Nouvelle version",
    "Not in this version": "Absent de cette version",
    "It was removed. The version on the left shows it.":
        "Il a été supprimé. La version de gauche l'affiche.",
    "It is new. The version on the right shows it.":
        "Il est nouveau. La version de droite l'affiche.",
    "A form is either a form id or an external reference, not both.":
        "Un formulaire est soit un ID de formulaire, soit une référence externe, pas les deux.",
    "A property cannot depend on itself.": "Une propriété ne peut pas dépendre d'elle-même.",
    "A regular expression the value must match.":
        "Une expression régulière à laquelle la valeur doit correspondre.",
    "Add Choice": "Ajouter une option",
    "Add Condition": "Ajouter une condition",
    "Add Group": "Ajouter un groupe",
    "Add a property for each field users fill in.":
        "Ajoutez une propriété pour chaque champ que les utilisateurs remplissent.",
    "Add an element type": "Ajouter un type d'élément",
    "Add an element type…": "Ajouter un type d'élément…",
    "Add it": "Ajouter",
    "Also set in the JSON: {keys}": "Également défini dans le JSON : {keys}",
    "Always written; users do not see the field.":
        "Toujours écrite ; les utilisateurs ne voient pas le champ.",
    'Another property already has the id "{id}".': 'Une autre propriété a déjà l\'ID "{id}".',
    "Applies to": "S'applique à",
    "Apply Template": "Appliquer le modèle",
    "Attribute": "Attribut",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Un travail automatisé réalisé par un Java delegate, une expression ou une tâche externe",
    "Automated work carried out by a system": "Un travail automatisé réalisé par un système",
    "BPMN attribute": "Attribut BPMN",
    "Basics": "Paramètres de base",
    "Being edited in": "En cours d'édition dans",
    "Called process": "Processus appelé",
    "Camunda properties, templates and lint": "Propriétés Camunda, modèles et linting",
    "Checked by default.": "Coché par défaut.",
    "Child process": "Processus enfant",
    "Choice name": "Nom de l'option",
    "Choice value": "Valeur de l'option",
    "Choices": "Options",
    "Choose a property": "Choisir une propriété",
    "Clear search": "Effacer la recherche",
    "Close": "Fermer",
    "Collapse": "Réduire",
    "Create an element template": "Créer un modèle d'élément",
    "Create template": "Créer le modèle",
    "Creates element": "Élément créé",
    "Delegate": "Delegate",
    "Delete group": "Supprimer le groupe",
    "Delete property": "Supprimer la propriété",
    "Design": "Conception",
    "Documentation link": "Lien vers la documentation",
    "Duplicate property": "Dupliquer la propriété",
    "Editable": "Modifiable",
    "Element Templates": "Modèles d'élément",
    "Element actions": "Actions de l'élément",
    "Elements": "Éléments",
    "Engine": "Moteur",
    "Engine-neutral modeling": "Modélisation indépendante du moteur",
    "Enter a number.": "Saisissez un nombre.",
    "Event definition": "Définition d'événement",
    "Expand": "Développer",
    "Extension property": "Propriété d'extension",
    "Favourites": "Favoris",
    "Fix it in the JSON editor; until then the builder is read-only.":
        "Corrigez l'erreur dans l'éditeur JSON ; d'ici là, l'éditeur graphique est en lecture seule.",
    "Fixed value": "Valeur fixe",
    "For example: Send mail": "Par exemple : Envoyer un e-mail",
    "Groups": "Groupes",
    "Groups put properties under their own heading in the properties panel.":
        "Les groupes réunissent des propriétés sous leur propre titre dans le panneau des propriétés.",
    "Help text below the field.": "Texte d'aide sous le champ.",
    "Hide preview": "Masquer l'aperçu",
    "Human": "Humain",
    "Implement": "Implémenter",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "« Implémenter » nécessite une plateforme d'exécution Camunda ; ce modèle n'en a aucune. Attribuez-en une pour l'activer.",
    "Is empty": "Est vide",
    "Is one of": "Est l'un de",
    "Is shown": "Est affiché",
    "Java delegate": "Java delegate",
    "Leave the value out of the XML while it is empty.":
        "Omettre la valeur dans le XML tant qu'elle est vide.",
    "Lets conditions refer to this property.":
        "Permet aux conditions de faire référence à cette propriété.",
    "Linked from the template in the properties panel.":
        "Lié depuis le modèle dans le panneau des propriétés.",
    "Maximum length": "Longueur maximale",
    "Message subscription": "Abonnement au message",
    "Minimum length": "Longueur minimale",
    "Mode": "Mode",
    "Mode: {mode}": "Mode : {mode}",
    "Move down": "Déplacer vers le bas",
    "Move up": "Déplacer vers le haut",
    "Name or code": "Nom ou code",
    "No FEEL": "Pas de FEEL",
    'No group has the id "{id}"; the property shows under "Custom properties".':
        'Aucun groupe n\'a l\'ID "{id}" ; la propriété s\'affiche sous "Propriétés personnalisées".',
    "No groups match your search.": "Aucun groupe ne correspond à votre recherche.",
    "No groups yet.": "Aucun groupe pour l'instant.",
    "No matches in other models": "Aucun résultat dans d'autres modèles",
    "No properties match your search.": "Aucune propriété ne correspond à votre recherche.",
    "No properties yet.": "Aucune propriété pour l'instant.",
    'No property has the id "{id}".': "Aucune propriété n'a l'ID \"{id}\".",
    "No settings match your search.": "Aucun paramètre ne correspond à votre recherche.",
    "No templates found": "Aucun modèle trouvé",
    "No value": "Aucune valeur",
    "No visible parameters": "Aucun paramètre visible",
    "None": "Aucune",
    "Operator": "Opérateur",
    "Optional": "Facultatif",
    "Other": "Autres",
    "Parts of the template": "Parties du modèle",
    "Pattern": "Motif",
    "Pattern message": "Message d'erreur du motif",
    "Pick the engine and the element the template is for. You can change both later.":
        "Choisissez le moteur et l'élément auxquels le modèle est destiné. Vous pourrez modifier les deux plus tard.",
    "Placeholder": "Texte indicatif",
    "Placement": "Emplacement",
    "Preview": "Aperçu",
    "Problems": "Problèmes",
    "Properties join the group with this id.":
        "Les propriétés sont rattachées au groupe par cet ID.",
    "Property": "Propriété",
    "Raise it whenever you change a template that is in use.":
        "Augmentez-la chaque fois que vous modifiez un modèle en cours d'utilisation.",
    "Read-only": "Lecture seule",
    "Remove choice": "Supprimer l'option",
    "Remove condition": "Supprimer la condition",
    "Remove {value}": "Supprimer {value}",
    "Required": "Obligatoire",
    "Search failed": "La recherche a échoué",
    "Search groups": "Rechercher des groupes",
    "Search other models": "Rechercher dans d'autres modèles",
    "Search properties": "Rechercher des propriétés",
    "Search template settings": "Rechercher dans les paramètres du modèle",
    "Search templates...": "Rechercher des modèles...",
    "Search...": "Rechercher...",
    "Searching…": "Recherche en cours…",
    "Select a template to see its details": "Sélectionnez un modèle pour afficher ses détails",
    "Show": "Afficher",
    "Show only when": "Afficher uniquement si",
    "Show preview": "Afficher l'aperçu",
    "Shown above the field.": "Affiché au-dessus du champ.",
    "Shown from the info icon next to the field.":
        "Affichée via l'icône d'information à côté du champ.",
    "Shown in the empty field.": "Affiché dans le champ vide.",
    "Shown when the value does not match the pattern.":
        "Affiché lorsque la valeur ne correspond pas au motif.",
    "Shown when users pick a template.": "Affiché lorsque les utilisateurs choisissent un modèle.",
    "Shown with the name when users pick a template.":
        "Affichée avec le nom lorsque les utilisateurs choisissent un modèle.",
    "Task Type": "Type de tâche",
    "Task header": "En-tête de tâche",
    "The JSON is invalid: {message}": "Le JSON n'est pas valide : {message}",
    "The builder does not edit {binding} bindings yet; edit this one in JSON.":
        "L'éditeur graphique ne prend pas encore en charge les liaisons {binding} ; modifiez celle-ci dans le JSON.",
    "The builder opens once the file holds a valid element template.":
        "L'éditeur graphique s'ouvre dès que le fichier contient un modèle d'élément valide.",
    "The choice new elements start with.": "L'option présélectionnée pour les nouveaux éléments.",
    "The element it is applied to": "L'élément auquel le modèle est appliqué",
    "The elements users can apply the template to.":
        "Les éléments auxquels les utilisateurs peuvent appliquer le modèle.",
    'The engine decides which bindings the template can use. Your choice is saved as its "$schema".':
        'Le moteur détermine les liaisons que le modèle peut utiliser. Votre choix est enregistré dans son "$schema".',
    "The event definition the created event gets.":
        "La définition d'événement que reçoit l'événement créé.",
    "The fewest characters users may enter.":
        "Le nombre minimal de caractères que les utilisateurs doivent saisir.",
    "The field shows only while all these conditions hold.":
        "Le champ ne s'affiche que tant que toutes ces conditions sont remplies.",
    "The group the field appears in.": "Le groupe dans lequel le champ apparaît.",
    "The group's heading in the properties panel.":
        "Le titre du groupe dans le panneau des propriétés.",
    "The kind of field users see.": "Le type de champ que voient les utilisateurs.",
    "The most characters users may enter.":
        "Le nombre maximal de caractères que les utilisateurs peuvent saisir.",
    "The options users pick from.": "Les options parmi lesquelles les utilisateurs choisissent.",
    "The preview shows the last template without errors.":
        "L'aperçu affiche le dernier modèle sans erreur.",
    "The template as the properties panel shows it. Values entered here are not saved.":
        "Le modèle tel que le panneau des propriétés l'affiche. Les valeurs saisies ici ne sont pas enregistrées.",
    'The template has no "$schema" that names its engine.':
        'Le modèle n\'a pas de "$schema" qui indique son moteur.',
    "The value is FEEL": "La valeur est en FEEL",
    "The value is an expression.": "La valeur est une expression.",
    "The value must be one of the choices.": "La valeur doit être l'une des options.",
    "The value new elements start with.": "La valeur initiale des nouveaux éléments.",
    "This binding needs a zeebe:userTask property.":
        "Cette liaison nécessite une propriété zeebe:userTask.",
    "This binding needs one of the element types {types}.":
        "Cette liaison nécessite l'un des types d'élément {types}.",
    "This binding needs the called process id.":
        "Cette liaison nécessite l'ID du processus appelé.",
    "This binding needs the decision id.": "Cette liaison nécessite l'ID de la décision.",
    "This binding needs the element type {type}.":
        "Cette liaison nécessite le type d'élément {type}.",
    "This binding needs the result variable.": "Cette liaison nécessite la variable de résultat.",
    "This binding needs the script expression.": "Cette liaison nécessite l'expression du script.",
    "This file does not contain an element template.":
        "Ce fichier ne contient pas de modèle d'élément.",
    "Tooltip": "Info-bulle",
    "Try a different search term": "Essayez un autre terme de recherche",
    "Turns the element into this type when the template is applied.":
        "Transforme l'élément en ce type lorsque le modèle est appliqué.",
    "Unique together with the version.": "Unique en combinaison avec la version.",
    "Unlabeled property": "Propriété sans libellé",
    "Unnamed": "Sans nom",
    "Unnamed group": "Groupe sans nom",
    "Untitled template": "Modèle sans titre",
    "Users can change the value.": "Les utilisateurs peuvent modifier la valeur.",
    "Users may enter FEEL": "Les utilisateurs peuvent saisir du FEEL",
    "Users must fill in a value.": "Les utilisateurs doivent saisir une valeur.",
    "View": "Vue",
    "Where the value is written.": "Indique où la valeur est écrite.",
    "Whether users may or must enter a FEEL expression.":
        "Indique si les utilisateurs peuvent ou doivent saisir une expression FEEL.",
    "Which engine is this template for?": "À quel moteur ce modèle est-il destiné ?",
    "a, b, c": "a, b, c",
    "caught by {elements}": "intercepté par {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "facultatif",
    "read-only": "lecture seule",
    "required": "obligatoire",
    "thrown by {elements}": "déclenché par {elements}",
    "{count} properties": "{count} propriétés",
    "{count} property": "{count} propriété",
    "1 Error": "1 erreur",
    "1 Warning": "1 avertissement",
    "{count} Errors": "{count} erreurs",
    "{count} Warnings": "{count} avertissements",
    "{count} in {tab}": "{count} dans {tab}",
    "{position} of {count}": "{position} sur {count}",
    "{type}: no preview yet": "{type} : pas encore d'aperçu",
    "A Hidden property should have a value.": "Une propriété masquée devrait avoir une valeur.",
    "Activity": "Activité",
    'Another group already has the id "{id}".': 'Un autre groupe a déjà l\'ID "{id}".',
    "Edit in the JSON for now": "Pour l'instant, à modifier dans le JSON",
    "Enter an id.": "Saisissez un ID.",
    "For other element types": "Pour d'autres types d'élément",
    "Optional on an input mapping is deprecated; from Camunda 8.8 an empty input mapping is null.":
        "Facultatif sur un mappage d'entrée est obsolète ; depuis Camunda 8.8, un mappage d'entrée vide vaut null.",
    "Remove FEEL": "Retirer FEEL",
    "Remove Optional": "Retirer Facultatif",
    "Set the element type to {type}": "Définir le type d'élément sur {type}",
    "Templates for {type} cannot be previewed yet.":
        "Les modèles pour {type} ne peuvent pas encore être prévisualisés.",
    "This binding is deprecated; a task definition with the attribute type replaces it.":
        "Cette liaison est obsolète ; une définition de tâche avec l'attribut type la remplace.",
    "This binding only works on: {types}.": "Cette liaison ne fonctionne que sur : {types}.",
    "This change was not written: the JSON around {path} is not what the builder expects. Fix it in the JSON editor.":
        "Cette modification n'a pas été écrite : le JSON autour de {path} n'est pas ce qu'attend l'éditeur graphique. Corrigez-le dans l'éditeur JSON.",
    "Use the task definition": "Utiliser la définition de tâche",
    "Users cannot enter FEEL into a field they cannot edit.":
        "Les utilisateurs ne peuvent pas saisir de FEEL dans un champ qu'ils ne peuvent pas modifier.",
    "Generate from name": "Générer à partir du nom",
    "Review all IDs…": "Vérifier tous les ID…",
    "Rename the ID to {id}": "Renommer l'ID en {id}",
    "The ID already follows the name.": "L'ID suit déjà le nom.",
    "Add a name to generate the ID from it.": "Ajoutez un nom pour en générer l'ID.",
    "Current": "Actuel",
    "Incoming": "Entrant",
    "your branch": "votre branche",
    "other branch": "autre branche",
    "your commit": "votre commit",
    "your stash": "votre stash",
    "Taken from this side": "Repris de ce côté",
    "Taken from the other side": "Repris de l'autre côté",
    "Conflict": "Conflit",
    "Step through": "Parcourir",
    "Open conflicts": "Conflits ouverts",
    "All merged elements": "Tous les éléments fusionnés",
    "No open conflicts": "Aucun conflit ouvert",
    "1 open conflict": "1 conflit ouvert",
    "{count} open conflicts": "{count} conflits ouverts",
    "Keep everything inside": "Conserver tout son contenu",
    "Undo pick": "Annuler le choix",
    "Pulled in:": "Ajouté :",
    "Dropped:": "Retiré :",
    "Open again:": "Rouvert :",
    "Keep current": "Conserver Actuel",
    "Keep incoming": "Conserver Entrant",
    "Kept from current, your pick": "Conservé depuis Actuel, votre choix",
    "Kept from incoming, your pick": "Conservé depuis Entrant, votre choix",
    "Kept from current with everything inside, your pick":
        "Conservé depuis Actuel avec tout son contenu, votre choix",
    "Kept from incoming with everything inside, your pick":
        "Conservé depuis Entrant avec tout son contenu, votre choix",
    "Kept from current with its flows, your pick":
        "Conservé depuis Actuel avec ses flux, votre choix",
    "Kept from incoming with its flows, your pick":
        "Conservé depuis Entrant avec ses flux, votre choix",
    "Kept from current: {element}": "Conservé depuis Actuel : {element}",
    "Kept from incoming: {element}": "Conservé depuis Entrant : {element}",
    "This pick brings in {element}, which needs {target}":
        "Ce choix ajoute {element}, qui a besoin de {target}",
    "{element} and {target} hold the same ID": "{element} et {target} ont le même ID",
    "Also keep the flow current removed with it":
        "Conserver aussi le flux supprimé avec lui par Actuel",
    "Also keep the {count} flows current removed with it":
        "Conserver aussi les {count} flux supprimés avec lui par Actuel",
    "Also keep the flow incoming removed with it":
        "Conserver aussi le flux supprimé avec lui par Entrant",
    "Also keep the {count} flows incoming removed with it":
        "Conserver aussi les {count} flux supprimés avec lui par Entrant",
    "Also keep the boundary event current removed with it":
        "Conserver aussi l'événement de bordure supprimé avec lui par Actuel",
    "Also keep the {count} elements current removed with it":
        "Conserver aussi les {count} éléments supprimés avec lui par Actuel",
    "Also keep the boundary event incoming removed with it":
        "Conserver aussi l'événement de bordure supprimé avec lui par Entrant",
    "Also keep the {count} elements incoming removed with it":
        "Conserver aussi les {count} éléments supprimés avec lui par Entrant",
    "Took back the pick of {element}": "Choix de {element} annulé",
    "Build": "Générer",
    "Notes of the build": "Notes de la génération",
    "Compare with current": "Comparer avec Actuel",
    "Compare with incoming": "Comparer avec Entrant",
    "Result against current": "Résultat par rapport à Actuel",
    "Result against incoming": "Résultat par rapport à Entrant",
    "Result": "Résultat",
    "Review notes ({count})": "Vérifier les notes ({count})",
    "{element} connects shapes drawn by different sides; check where it meets {ends}":
        "{element} relie des formes dessinées par des côtés différents ; vérifiez où il rejoint {ends}",
    "{first} and {second} were added at the same place":
        "{first} et {second} ont été ajoutés au même endroit",
    "{element} is drawn by another side than {containers}; check that it still sits inside":
        "{element} est dessiné par un autre côté que {containers} ; vérifiez qu'il est toujours à l'intérieur",
    "{element} is kept without the flows the other side removed with it: {connections}":
        "{element} est conservé sans les flux que l'autre côté a supprimés avec lui : {connections}",
    "{element} is kept without the boundary event the other side removed with it: {elements}":
        "{element} est conservé sans l'événement de bordure que l'autre côté a supprimé avec lui : {elements}",
    "{element} is kept without the {count} elements the other side removed with it: {elements}":
        "{element} est conservé sans les {count} éléments que l'autre côté a supprimés avec lui : {elements}",
    "{flow} is kept but is no longer the default flow of {element}":
        "{flow} est conservé, mais n'est plus le flux par défaut de {element}",
    "{flow} is kept, but {element} keeps {keptDefault} as its default flow":
        "{flow} est conservé, mais {element} garde {keptDefault} comme flux par défaut",
    "The file's {attribute} differs between the sides; current's is kept":
        "L'attribut {attribute} du fichier diffère entre les côtés ; la valeur d'Actuel est conservée",
    "1 conflict left": "1 conflit restant",
    "{count} conflicts left": "{count} conflits restants",
    "Elements of this version the result keeps as they are here.":
        "Éléments de cette version que le résultat conserve tels qu'ils sont ici.",
    "Elements of this version the result takes from the other version, or leaves out as the other version removed them.":
        "Éléments de cette version que le résultat reprend de l'autre version, ou laisse de côté car l'autre version les a supprimés.",
    "Open conflicts on elements this version has.":
        "Conflits ouverts sur des éléments que contient cette version.",
    "Elements only the other version has are counted on the other pane only.":
        "Les éléments que seule l'autre version contient ne sont comptés que dans l'autre volet.",
    "More actions": "Plus d'actions",
    "This step has no shape, so it is listed here.":
        "Cette étape n'a pas de forme, elle est donc listée ici.",
    "Not visible in the diagram ({count})": "Non visibles dans le diagramme ({count})",
    "1 open conflict not visible in the diagram": "1 conflit ouvert non visible dans le diagramme",
    "{count} open conflicts not visible in the diagram":
        "{count} conflits ouverts non visibles dans le diagramme",
    "Keep current with everything inside": "Conserver Actuel avec tout son contenu",
    "Keep incoming with everything inside": "Conserver Entrant avec tout son contenu",
    "Leave out": "Laisser de côté",
    "Also keep its removed flows": "Conserver aussi ses flux supprimés",
    "Keep it as current has it": "Le conserver tel que l'a Actuel",
    "Keep it as incoming has it": "Le conserver tel que l'a Entrant",
    "Keep it and everything inside as current has them":
        "Le conserver avec tout son contenu tel que l'a Actuel",
    "Keep it and everything inside as incoming has them":
        "Le conserver avec tout son contenu tel que l'a Entrant",
    "Keep it and every pool with its process as current has them":
        "Le conserver avec chaque pool et son processus tels que les a Actuel",
    "Keep it and every pool with its process as incoming has them":
        "Le conserver avec chaque pool et son processus tels que les a Entrant",
    "Leave it out, as current removed it": "Le laisser de côté, car Actuel l'a supprimé",
    "Leave it out, as current doesn't have it": "Le laisser de côté, car Actuel ne l'a pas",
    "Leave it out, as incoming removed it": "Le laisser de côté, car Entrant l'a supprimé",
    "Leave it out, as incoming doesn't have it": "Le laisser de côté, car Entrant ne l'a pas",
    "Go back to what the merge decided by itself":
        "Revenir à ce que la fusion a décidé d'elle-même",
    "none": "aucune valeur",
    "and other content": "et d'autres contenus",
    "Removed in current": "Supprimé dans Actuel",
    "Not in current": "Absent d'Actuel",
    "Removed in incoming": "Supprimé dans Entrant",
    "Not in incoming": "Absent d'Entrant",
    "Kept from current with everything inside: {element}":
        "Conservé depuis Actuel avec tout son contenu : {element}",
    "Kept from incoming with everything inside: {element}":
        "Conservé depuis Entrant avec tout son contenu : {element}",
    "Kept from current with its flows: {element}":
        "Conservé depuis Actuel avec ses flux : {element}",
    "Kept from incoming with its flows: {element}":
        "Conservé depuis Entrant avec ses flux : {element}",
    "Left out: {element}, as current removed it":
        "Laissé de côté : {element}, car Actuel l'a supprimé",
    "Left out: {element}, as current doesn't have it":
        "Laissé de côté : {element}, car Actuel ne l'a pas",
    "Left out: {element}, as incoming removed it":
        "Laissé de côté : {element}, car Entrant l'a supprimé",
    "Left out: {element}, as incoming doesn't have it":
        "Laissé de côté : {element}, car Entrant ne l'a pas",
    "Took back the pick. {element} is an open conflict again.":
        "Choix annulé. {element} est de nouveau un conflit ouvert.",
    "Can't keep {element}": "Impossible de conserver {element}",
    "Can't leave out {element}": "Impossible de laisser {element} de côté",
    "Can't take back the pick of {element}": "Impossible d'annuler le choix de {element}",
    "Nothing blocks keeping {element} now": "Plus rien n'empêche de conserver {element}",
    "Nothing blocks leaving out {element} now": "Plus rien n'empêche de laisser {element} de côté",
    "Nothing blocks taking back the pick of {element} now":
        "Plus rien n'empêche d'annuler le choix de {element}",
    "{element} needs {target}; no version has it":
        "{element} a besoin de {target} ; aucune version ne le contient",
    "{element} needs {target}; your pick takes a side without it":
        "{element} a besoin de {target} ; votre choix prend un côté qui ne le contient pas",
    "{element} needs a part of {target}; your pick takes a side without it":
        "{element} a besoin d'une partie de {target} ; votre choix prend un côté qui ne la contient pas",
    "{element} needs {target}; this pick drops it":
        "{element} a besoin de {target} ; ce choix le retire",
    "{element} needs a part of {target} this pick leaves out":
        "{element} a besoin d'une partie de {target} que ce choix laisse de côté",
    "{element} needs {target}; this side lacks it":
        "{element} a besoin de {target} ; ce côté ne le contient pas",
    "{element} needs a part of {target}; this side lacks it":
        "{element} a besoin d'une partie de {target} ; ce côté ne la contient pas",
    "{element} needs {target}; the result leaves it out":
        "{element} a besoin de {target} ; le résultat le laisse de côté",
    "{element} needs a part of {target} the kept version lacks":
        "{element} a besoin d'une partie de {target} absente de la version conservée",
    "Your pick of {element} needs {target}": "Votre choix de {element} a besoin de {target}",
    "{element} and {target} have a pool of the same process":
        "{element} et {target} ont un pool du même processus",
    "{element} needs it; no version has it":
        "{element} en a besoin ; aucune version ne le contient",
    "{element} needs it; your pick takes a side without it":
        "{element} en a besoin ; votre choix prend un côté qui ne le contient pas",
    "{element} needs a part of it; your pick takes a side without it":
        "{element} a besoin d'une partie de celui-ci ; votre choix prend un côté qui ne la contient pas",
    "{element} needs it": "{element} en a besoin",
    "{element} needs a part of it this pick leaves out":
        "{element} a besoin d'une partie de celui-ci que ce choix laisse de côté",
    "{element} needs it; this side lacks it": "{element} en a besoin ; ce côté ne le contient pas",
    "{element} needs a part of it; this side lacks it":
        "{element} a besoin d'une partie de celui-ci ; ce côté ne la contient pas",
    "{element} needs a part of it the kept version lacks":
        "{element} a besoin d'une partie de celui-ci absente de la version conservée",
    "Your pick of {element} needs it": "Votre choix de {element} en a besoin",
    "This pick brings in {element}, which needs it": "Ce choix ajoute {element}, qui en a besoin",
    "{element} holds the same ID": "{element} a le même ID",
    "{element} has a pool of the same process": "{element} a un pool du même processus",
    "and {count} more": "et {count} autres",
    "Data store": "Magasin de données",
    "Item definition": "Définition d'élément",
    "Category": "Catégorie",
    "Interface": "Interface",
    "End point": "Point de terminaison",
    "Partner entity": "Entité partenaire",
    "Partner role": "Rôle partenaire",
    "Correlation property": "Propriété de corrélation",
    "Global task": "Tâche globale",
    "Flow from {source} to {target}": "Flux de {source} vers {target}",
    "Both sides changed the layout of {elements}; current's is kept":
        "Les deux côtés ont modifié la disposition de {elements} ; celle d'Actuel est conservée",
    "Both sides changed the layout of {elements}; incoming's is kept":
        "Les deux côtés ont modifié la disposition de {elements} ; celle d'Entrant est conservée",
};

export default dictionary;
