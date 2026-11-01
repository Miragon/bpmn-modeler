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
    "Set the element type": "Establecer el tipo de elemento",
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
};

export default dictionary;
