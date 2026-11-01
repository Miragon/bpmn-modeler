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
    "Set the element type": "Définir le type d'élément",
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
};

export default dictionary;
