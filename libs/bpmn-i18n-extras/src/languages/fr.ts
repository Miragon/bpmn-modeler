/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Being edited in": "En cours d'édition dans",
    "Design": "Conception",
    "Element actions": "Actions de l'élément",
    "Implement": "Implémenter",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "« Implémenter » nécessite une plateforme d'exécution Camunda ; ce modèle n'en a aucune. Attribuez-en une pour l'activer.",
    "Mode": "Mode",
    "Read-only": "Lecture seule",
    "View": "Vue",
    "{mode} — open properties panel": "{mode} — ouvrir le panneau des propriétés",
};

export default dictionary;
