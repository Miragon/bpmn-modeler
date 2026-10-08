/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Apply Template": "Aplicar plantilla",
    "Being edited in": "Se está editando en",
    "Camunda properties, templates and lint": "Propiedades de Camunda, plantillas y linting",
    "Clear search": "Borrar búsqueda",
    "Close": "Cerrar",
    "Collapse": "Contraer",
    "Delegate": "Delegate",
    "Design": "Diseño",
    "Element Templates": "Plantillas de elemento",
    "Element actions": "Acciones del elemento",
    "Engine-neutral modeling": "Modelado independiente del motor",
    "Expand": "Expandir",
    "Favourites": "Favoritos",
    "Implement": "Implementar",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Implementar necesita una plataforma de ejecución de Camunda; este modelo no tiene ninguna. Asigne una para habilitarlo.",
    "Mode": "Modo",
    "Mode: {mode}": "Modo: {mode}",
    "No templates found": "No se encontraron plantillas",
    "No visible parameters": "No hay parámetros visibles",
    "Other": "Otros",
    "Read-only": "Solo lectura",
    "Search templates...": "Buscar plantillas...",
    "Search...": "Buscar...",
    "Select a template to see its details": "Seleccione una plantilla para ver sus detalles",
    "Task Type": "Tipo de tarea",
    "Try a different search term": "Pruebe con otro término de búsqueda",
    "Unnamed": "Sin nombre",
    "View": "Ver",
    "double": "double",
    "integer": "integer",
    "optional": "opcional",
    "read-only": "solo lectura",
    "required": "obligatorio",
    "{count} properties": "{count} propiedades",
};

export default dictionary;
