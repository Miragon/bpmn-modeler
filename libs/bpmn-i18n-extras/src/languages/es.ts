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
        "El formulario vinculado no existe o no es válido. Compruebe la referencia al formulario.",
    "Preview linked form": "Previsualizar formulario vinculado",
    "Linked form preview": "Vista previa del formulario vinculado",
    "Refresh": "Actualizar",
    "Close form preview": "Cerrar vista previa del formulario",
    "Read-only preview of the saved local form.":
        "Vista previa de solo lectura del formulario local guardado.",
    "Saved form loaded.": "Formulario guardado cargado.",
    "Open a workspace folder to preview linked forms.":
        "Abra una carpeta de trabajo para previsualizar formularios vinculados.",
    "No saved local form matches this reference. Refresh to try again.":
        "Ningún formulario local guardado coincide con esta referencia. Actualice para reintentar.",
    "Multiple saved forms match this reference. Choose a form to preview.":
        "Varios formularios guardados coinciden con esta referencia. Elija uno para previsualizar.",
    "The saved form could not be read. Refresh to try again.":
        "No se pudo leer el formulario guardado. Actualice para reintentar.",
    "The host did not answer. Refresh to try again.":
        "El host no respondió. Actualice para reintentar.",
    "The saved form is invalid or unsupported. Open it in the form editor.":
        "El formulario guardado no es válido o no es compatible. Ábralo en el editor de formularios.",
    "The form preview could not be loaded. Refresh to try again.":
        "No se pudo cargar la vista previa. Actualice para reintentar.",
    "Apply Template": "Aplicar plantilla",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Trabajo automatizado realizado por un Java delegate, una expresión o una tarea externa",
    "Automated work carried out by a system": "Trabajo automatizado realizado por un sistema",
    "Being edited in": "Se está editando en",
    "Camunda properties, templates and lint": "Propiedades de Camunda, plantillas y linting",
    "Child process": "Proceso hijo",
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
    "Human": "Humano",
    "Implement": "Implementar",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Implementar necesita una plataforma de ejecución de Camunda; este modelo no tiene ninguna. Asigne una para habilitarlo.",
    "Java delegate": "Java delegate",
    "Mode": "Modo",
    "Mode: {mode}": "Modo: {mode}",
    "Name or code": "Nombre o código",
    "No matches in other models": "Sin coincidencias en otros modelos",
    "No templates found": "No se encontraron plantillas",
    "No visible parameters": "No hay parámetros visibles",
    "Other": "Otros",
    "Read-only": "Solo lectura",
    "Search failed": "La búsqueda ha fallado",
    "Search other models": "Buscar en otros modelos",
    "Search templates...": "Buscar plantillas...",
    "Search...": "Buscar...",
    "Searching…": "Buscando…",
    "Select a template to see its details": "Seleccione una plantilla para ver sus detalles",
    "Task Type": "Tipo de tarea",
    "Try a different search term": "Pruebe con otro término de búsqueda",
    "Unnamed": "Sin nombre",
    "View": "Ver",
    "caught by {elements}": "capturado por {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "opcional",
    "read-only": "solo lectura",
    "required": "obligatorio",
    "thrown by {elements}": "lanzado por {elements}",
    "{count} properties": "{count} propiedades",
    "{count} property": "{count} propiedad",
};

export default dictionary;
