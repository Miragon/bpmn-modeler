/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Apply Template": "Appliquer le modèle",
    "Being edited in": "En cours d'édition dans",
    "Clear search": "Effacer la recherche",
    "Close": "Fermer",
    "Collapse": "Réduire",
    "Delegate": "Delegate",
    "Design": "Conception",
    "Element Templates": "Modèles d'élément",
    "Element actions": "Actions de l'élément",
    "Expand": "Développer",
    "Favourites": "Favoris",
    "Implement": "Implémenter",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "« Implémenter » nécessite une plateforme d'exécution Camunda ; ce modèle n'en a aucune. Attribuez-en une pour l'activer.",
    "Mode": "Mode",
    "No templates found": "Aucun modèle trouvé",
    "No visible parameters": "Aucun paramètre visible",
    "Other": "Autres",
    "Read-only": "Lecture seule",
    "Search templates...": "Rechercher des modèles...",
    "Search...": "Rechercher...",
    "Select a template to see its details": "Sélectionnez un modèle pour afficher ses détails",
    "Task Type": "Type de tâche",
    "Try a different search term": "Essayez un autre terme de recherche",
    "Unnamed": "Sans nom",
    "View": "Vue",
    "double": "double",
    "integer": "integer",
    "optional": "facultatif",
    "read-only": "lecture seule",
    "required": "obligatoire",
    "{count} properties": "{count} propriétés",
    "{mode} — open properties panel": "{mode} — ouvrir le panneau des propriétés",
};

export default dictionary;
