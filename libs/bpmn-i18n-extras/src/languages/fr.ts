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
    "Apply Template": "Appliquer le modèle",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Un travail automatisé réalisé par un Java delegate, une expression ou une tâche externe",
    "Automated work carried out by a system": "Un travail automatisé réalisé par un système",
    "Being edited in": "En cours d'édition dans",
    "Camunda properties, templates and lint": "Propriétés Camunda, modèles et linting",
    "Child process": "Processus enfant",
    "Clear search": "Effacer la recherche",
    "Close": "Fermer",
    "Collapse": "Réduire",
    "Delegate": "Delegate",
    "Design": "Conception",
    "Element Templates": "Modèles d'élément",
    "Element actions": "Actions de l'élément",
    "Engine-neutral modeling": "Modélisation indépendante du moteur",
    "Expand": "Développer",
    "Favourites": "Favoris",
    "Human": "Humain",
    "Implement": "Implémenter",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "« Implémenter » nécessite une plateforme d'exécution Camunda ; ce modèle n'en a aucune. Attribuez-en une pour l'activer.",
    "Java delegate": "Java delegate",
    "Mode": "Mode",
    "Mode: {mode}": "Mode : {mode}",
    "Name or code": "Nom ou code",
    "No matches in other models": "Aucun résultat dans d'autres modèles",
    "No templates found": "Aucun modèle trouvé",
    "No visible parameters": "Aucun paramètre visible",
    "Other": "Autres",
    "Read-only": "Lecture seule",
    "Search failed": "La recherche a échoué",
    "Search other models": "Rechercher dans d'autres modèles",
    "Search templates...": "Rechercher des modèles...",
    "Search...": "Rechercher...",
    "Searching…": "Recherche en cours…",
    "Select a template to see its details": "Sélectionnez un modèle pour afficher ses détails",
    "Task Type": "Type de tâche",
    "Try a different search term": "Essayez un autre terme de recherche",
    "Unnamed": "Sans nom",
    "View": "Vue",
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
