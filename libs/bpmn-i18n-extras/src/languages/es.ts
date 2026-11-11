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
    "Fit diagram to view": "Ajustar el diagrama a la vista",
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
    "Changes": "Cambios",
    "Not in this version": "No está en esta versión",
    "It was removed. The version on the left shows it.":
        "Se eliminó. La versión de la izquierda lo muestra.",
    "It is new. The version on the right shows it.":
        "Es nuevo. La versión de la derecha lo muestra.",
    "A form is either a form id or an external reference, not both.":
        "Un formulario usa un ID de formulario o una referencia externa, no ambos.",
    "A property cannot depend on itself.": "Una propiedad no puede depender de sí misma.",
    "A regular expression the value must match.":
        "Una expresión regular con la que debe coincidir el valor.",
    "Add Choice": "Añadir opción",
    "Add Condition": "Añadir condición",
    "Add Group": "Añadir grupo",
    "Add a property for each field users fill in.":
        "Añada una propiedad por cada campo que completen los usuarios.",
    "Add an element type": "Añadir un tipo de elemento",
    "Add an element type…": "Añadir un tipo de elemento…",
    "Add it": "Añadir",
    "Also set in the JSON: {keys}": "El JSON también define: {keys}",
    "Always written; users do not see the field.":
        "Siempre se escribe; los usuarios no ven el campo.",
    'Another property already has the id "{id}".': 'Otra propiedad ya tiene el ID "{id}".',
    "Applies to": "Se aplica a",
    "Apply Template": "Aplicar plantilla",
    "Attribute": "Atributo",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Trabajo automatizado realizado por un Java delegate, una expresión o una tarea externa",
    "Automated work carried out by a system": "Trabajo automatizado realizado por un sistema",
    "BPMN attribute": "Atributo BPMN",
    "Basics": "Información básica",
    "Being edited in": "Se está editando en",
    "Called process": "Proceso llamado",
    "Camunda properties, templates and lint": "Propiedades de Camunda, plantillas y linting",
    "Checked by default.": "Marcado de forma predeterminada.",
    "Child process": "Proceso hijo",
    "Choice name": "Nombre de la opción",
    "Choice value": "Valor de la opción",
    "Choices": "Opciones",
    "Choose a property": "Elija una propiedad",
    "Clear search": "Borrar búsqueda",
    "Close": "Cerrar",
    "Collapse": "Contraer",
    "Create an element template": "Crear una plantilla de elemento",
    "Create template": "Crear plantilla",
    "Creates element": "Elemento resultante",
    "Delegate": "Delegate",
    "Delete group": "Eliminar grupo",
    "Delete property": "Eliminar propiedad",
    "Design": "Diseño",
    "Documentation link": "Enlace de documentación",
    "Duplicate property": "Duplicar propiedad",
    "Editable": "Editable",
    "Element Templates": "Plantillas de elemento",
    "Element actions": "Acciones del elemento",
    "Elements": "Elementos",
    "Engine": "Motor",
    "Engine-neutral modeling": "Modelado independiente del motor",
    "Enter a number.": "Introduzca un número.",
    "Event definition": "Definición de evento",
    "Expand": "Expandir",
    "Extension property": "Propiedad de extensión",
    "Favourites": "Favoritos",
    "Fix it in the JSON editor; until then the builder is read-only.":
        "Corríjalo en el editor JSON; hasta entonces, el editor visual es de solo lectura.",
    "Fixed value": "Valor fijo",
    "For example: Send mail": "Por ejemplo: Enviar correo",
    "Groups": "Grupos",
    "Groups put properties under their own heading in the properties panel.":
        "Los grupos colocan las propiedades bajo su propio título en el panel de propiedades.",
    "Help text below the field.": "Texto de ayuda debajo del campo.",
    "Hide preview": "Ocultar vista previa",
    "Human": "Humano",
    "Implement": "Implementar",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Implementar necesita una plataforma de ejecución de Camunda; este modelo no tiene ninguna. Asigne una para habilitarlo.",
    "Is empty": "Está vacío",
    "Is one of": "Es uno de",
    "Is shown": "Está visible",
    "Java delegate": "Java delegate",
    "Leave the value out of the XML while it is empty.":
        "No escribir el valor en el XML mientras esté vacío.",
    "Lets conditions refer to this property.":
        "Permite que las condiciones hagan referencia a esta propiedad.",
    "Linked from the template in the properties panel.":
        "Se enlaza desde la plantilla en el panel de propiedades.",
    "Maximum length": "Longitud máxima",
    "Message subscription": "Suscripción de mensaje",
    "Minimum length": "Longitud mínima",
    "Mode": "Modo",
    "Mode: {mode}": "Modo: {mode}",
    "Move down": "Mover hacia abajo",
    "Move up": "Mover hacia arriba",
    "Name or code": "Nombre o código",
    "No FEEL": "Sin FEEL",
    'No group has the id "{id}"; the property shows under "Custom properties".':
        'Ningún grupo tiene el ID "{id}"; la propiedad se muestra en "Propiedades personalizadas".',
    "No groups match your search.": "Ningún grupo coincide con su búsqueda.",
    "No groups yet.": "Aún no hay grupos.",
    "No matches in other models": "Sin coincidencias en otros modelos",
    "No properties match your search.": "Ninguna propiedad coincide con su búsqueda.",
    "No properties yet.": "Aún no hay propiedades.",
    'No property has the id "{id}".': 'Ninguna propiedad tiene el ID "{id}".',
    "No settings match your search.": "Ninguna configuración coincide con su búsqueda.",
    "No templates found": "No se encontraron plantillas",
    "No value": "Sin valor",
    "No visible parameters": "No hay parámetros visibles",
    "None": "Ninguna",
    "Operator": "Operador",
    "Optional": "Opcional",
    "Other": "Otros",
    "Parts of the template": "Partes de la plantilla",
    "Pattern": "Patrón",
    "Pattern message": "Mensaje del patrón",
    "Pick the engine and the element the template is for. You can change both later.":
        "Elija el motor y el elemento a los que se destina la plantilla. Puede cambiar ambos más adelante.",
    "Placeholder": "Marcador de posición",
    "Placement": "Ubicación",
    "Preview": "Vista previa",
    "Problems": "Problemas",
    "Properties join the group with this id.": "Las propiedades se unen al grupo mediante este ID.",
    "Property": "Propiedad",
    "Raise it whenever you change a template that is in use.":
        "Auméntela cada vez que cambie una plantilla en uso.",
    "Read-only": "Solo lectura",
    "Remove choice": "Eliminar opción",
    "Remove condition": "Eliminar condición",
    "Remove {value}": "Eliminar {value}",
    "Required": "Obligatorio",
    "Search failed": "La búsqueda ha fallado",
    "Search groups": "Buscar grupos",
    "Search other models": "Buscar en otros modelos",
    "Search properties": "Buscar propiedades",
    "Search template settings": "Buscar configuración de la plantilla",
    "Search templates...": "Buscar plantillas...",
    "Search...": "Buscar...",
    "Searching…": "Buscando…",
    "Select a template to see its details": "Seleccione una plantilla para ver sus detalles",
    "Show": "Mostrar",
    "Show only when": "Mostrar solo cuando",
    "Show preview": "Mostrar vista previa",
    "Shown above the field.": "Se muestra encima del campo.",
    "Shown from the info icon next to the field.":
        "Se muestra desde el icono de información junto al campo.",
    "Shown in the empty field.": "Se muestra en el campo vacío.",
    "Shown when the value does not match the pattern.":
        "Se muestra cuando el valor no coincide con el patrón.",
    "Shown when users pick a template.": "Se muestra cuando los usuarios eligen una plantilla.",
    "Shown with the name when users pick a template.":
        "Se muestra junto al nombre cuando los usuarios eligen una plantilla.",
    "Task Type": "Tipo de tarea",
    "Task header": "Encabezado de tarea",
    "The JSON is invalid: {message}": "El JSON no es válido: {message}",
    "The builder does not edit {binding} bindings yet; edit this one in JSON.":
        "El editor visual aún no edita vinculaciones de tipo {binding}; edite esta en el JSON.",
    "The builder opens once the file holds a valid element template.":
        "El editor visual se abre cuando el archivo contiene una plantilla de elemento válida.",
    "The choice new elements start with.": "La opción inicial de los elementos nuevos.",
    "The element it is applied to": "El elemento al que se aplica",
    "The elements users can apply the template to.":
        "Los elementos a los que los usuarios pueden aplicar la plantilla.",
    'The engine decides which bindings the template can use. Your choice is saved as its "$schema".':
        'El motor determina qué vinculaciones puede usar la plantilla. Su elección se guarda como el "$schema" de la plantilla.',
    "The event definition the created event gets.":
        "La definición de evento que se asigna al evento creado.",
    "The fewest characters users may enter.":
        "El número mínimo de caracteres que pueden introducir los usuarios.",
    "The field shows only while all these conditions hold.":
        "El campo solo se muestra mientras se cumplan todas estas condiciones.",
    "The group the field appears in.": "El grupo en el que aparece el campo.",
    "The group's heading in the properties panel.":
        "El título del grupo en el panel de propiedades.",
    "The kind of field users see.": "El tipo de campo que ven los usuarios.",
    "The most characters users may enter.":
        "El número máximo de caracteres que pueden introducir los usuarios.",
    "The options users pick from.": "Las opciones entre las que eligen los usuarios.",
    "The preview shows the last template without errors.":
        "La vista previa muestra el último estado sin errores de la plantilla.",
    "The template as the properties panel shows it. Values entered here are not saved.":
        "La plantilla tal como la muestra el panel de propiedades. Los valores introducidos aquí no se guardan.",
    'The template has no "$schema" that names its engine.':
        'La plantilla no tiene un "$schema" que indique su motor.',
    "The value is FEEL": "El valor es FEEL",
    "The value is an expression.": "El valor es una expresión.",
    "The value must be one of the choices.": "El valor debe ser una de las opciones.",
    "The value new elements start with.": "El valor inicial de los elementos nuevos.",
    "This binding needs a zeebe:userTask property.":
        "Esta vinculación necesita una propiedad zeebe:userTask.",
    "This binding needs one of the element types {types}.":
        "Esta vinculación necesita uno de los tipos de elemento {types}.",
    "This binding needs the called process id.":
        "Esta vinculación necesita el ID del proceso llamado.",
    "This binding needs the decision id.": "Esta vinculación necesita el ID de la decisión.",
    "This binding needs the element type {type}.":
        "Esta vinculación necesita el tipo de elemento {type}.",
    "This binding needs the result variable.":
        "Esta vinculación necesita la variable de resultado.",
    "This binding needs the script expression.":
        "Esta vinculación necesita la expresión del script.",
    "This file does not contain an element template.":
        "Este archivo no contiene ninguna plantilla de elemento.",
    "Tooltip": "Información emergente",
    "Try a different search term": "Pruebe con otro término de búsqueda",
    "Turns the element into this type when the template is applied.":
        "Convierte el elemento en este tipo cuando se aplica la plantilla.",
    "Unique together with the version.": "Único en combinación con la versión.",
    "Unlabeled property": "Propiedad sin etiqueta",
    "Unnamed": "Sin nombre",
    "Unnamed group": "Grupo sin nombre",
    "Untitled template": "Plantilla sin título",
    "Users can change the value.": "Los usuarios pueden cambiar el valor.",
    "Users may enter FEEL": "Los usuarios pueden introducir FEEL",
    "Users must fill in a value.": "Los usuarios deben introducir un valor.",
    "View": "Ver",
    "Where the value is written.": "Dónde se escribe el valor.",
    "Whether users may or must enter a FEEL expression.":
        "Si los usuarios pueden o deben introducir una expresión FEEL.",
    "Which engine is this template for?": "¿Para qué motor es esta plantilla?",
    "a, b, c": "a, b, c",
    "caught by {elements}": "capturado por {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "opcional",
    "read-only": "solo lectura",
    "required": "obligatorio",
    "thrown by {elements}": "lanzado por {elements}",
    "{count} properties": "{count} propiedades",
    "{count} property": "{count} propiedad",
    "1 Error": "1 error",
    "1 Warning": "1 advertencia",
    "{count} Errors": "{count} errores",
    "{count} Warnings": "{count} advertencias",
    "{count} in {tab}": "{count} en {tab}",
    "{position} of {count}": "{position} de {count}",
    "{type}: no preview yet": "{type}: aún sin vista previa",
    "A Hidden property should have a value.": "Una propiedad oculta debería tener un valor.",
    "Activity": "Actividad",
    'Another group already has the id "{id}".': 'Otro grupo ya tiene el ID "{id}".',
    "Edit in the JSON for now": "Por ahora, editar en el JSON",
    "Enter an id.": "Introduzca un ID.",
    "For other element types": "Para otros tipos de elemento",
    "Optional on an input mapping is deprecated; from Camunda 8.8 an empty input mapping is null.":
        "Opcional en una asignación de entrada está obsoleto; desde Camunda 8.8 una asignación de entrada vacía es null.",
    "Remove FEEL": "Quitar FEEL",
    "Remove Optional": "Quitar Opcional",
    "Set the element type to {type}": "Establecer el tipo de elemento en {type}",
    "Templates for {type} cannot be previewed yet.":
        "Las plantillas para {type} aún no se pueden previsualizar.",
    "This binding is deprecated; a task definition with the attribute type replaces it.":
        "Esta vinculación está obsoleta; la sustituye una definición de tarea con el atributo type.",
    "This binding only works on: {types}.": "Esta vinculación solo funciona en: {types}.",
    "This change was not written: the JSON around {path} is not what the builder expects. Fix it in the JSON editor.":
        "Este cambio no se ha escrito: el JSON en torno a {path} no es lo que espera el editor visual. Corríjalo en el editor JSON.",
    "Use the task definition": "Usar la definición de tarea",
    "Users cannot enter FEEL into a field they cannot edit.":
        "Los usuarios no pueden introducir FEEL en un campo que no pueden editar.",
};

export default dictionary;
