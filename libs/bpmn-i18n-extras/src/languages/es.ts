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
    "No changes": "Sin cambios",
    "Show all": "Mostrar todo",
    "Show XML changes": "Mostrar cambios en el XML",
    "Old version": "Versión anterior",
    "New version": "Versión nueva",
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
    "Generate from name": "Generar a partir del nombre",
    "Review all IDs…": "Revisar todos los ID…",
    "Rename the ID to {id}": "Renombrar el ID a {id}",
    "The ID already follows the name.": "El ID ya sigue al nombre.",
    "Add a name to generate the ID from it.": "Añada un nombre para generar el ID a partir de él.",
    "Current": "Actual",
    "Incoming": "Entrante",
    "your branch": "su rama",
    "other branch": "otra rama",
    "your commit": "su commit",
    "your stash": "su stash",
    "Taken from this side": "Tomado de este lado",
    "Taken from the other side": "Tomado del otro lado",
    "Conflict": "Conflicto",
    "Step through": "Recorrer",
    "Open conflicts": "Conflictos abiertos",
    "All merged elements": "Todos los elementos fusionados",
    "No open conflicts": "No hay conflictos abiertos",
    "1 open conflict": "1 conflicto abierto",
    "{count} open conflicts": "{count} conflictos abiertos",
    "Keep everything inside": "Conservar todo su contenido",
    "Undo pick": "Retirar la elección",
    "Pulled in:": "Incorporado:",
    "Dropped:": "Descartado:",
    "Open again:": "Abierto de nuevo:",
    "Keep current": "Conservar Actual",
    "Keep incoming": "Conservar Entrante",
    "Kept from current, your pick": "Conservado de Actual, su elección",
    "Kept from incoming, your pick": "Conservado de Entrante, su elección",
    "Kept from current with everything inside, your pick":
        "Conservado de Actual con todo su contenido, su elección",
    "Kept from incoming with everything inside, your pick":
        "Conservado de Entrante con todo su contenido, su elección",
    "Kept from current with what was removed with it, your pick":
        "Conservado de Actual con lo que se eliminó con él, su elección",
    "Kept from incoming with what was removed with it, your pick":
        "Conservado de Entrante con lo que se eliminó con él, su elección",
    "Kept from current: {element}": "Conservado de Actual: {element}",
    "Kept from incoming: {element}": "Conservado de Entrante: {element}",
    "This pick brings in {element}, which needs {target}":
        "Esta elección incorpora {element}, que necesita {target}",
    "{element} and {target} hold the same ID": "{element} y {target} tienen el mismo ID",
    "Also keep the flow current removed with it":
        "Conservar también el flujo que Actual eliminó con él",
    "Also keep the {count} flows current removed with it":
        "Conservar también los {count} flujos que Actual eliminó con él",
    "Also keep the flow incoming removed with it":
        "Conservar también el flujo que Entrante eliminó con él",
    "Also keep the {count} flows incoming removed with it":
        "Conservar también los {count} flujos que Entrante eliminó con él",
    "Also keep the boundary event current removed with it":
        "Conservar también el evento de borde que Actual eliminó con él",
    "Also keep the {count} elements current removed with it":
        "Conservar también los {count} elementos que Actual eliminó con él",
    "Also keep the boundary event incoming removed with it":
        "Conservar también el evento de borde que Entrante eliminó con él",
    "Also keep the {count} elements incoming removed with it":
        "Conservar también los {count} elementos que Entrante eliminó con él",
    "Took back the pick of {element}": "Se retiró la elección de {element}",
    "Build": "Generar",
    "Notes of the build": "Notas de la generación",
    "Compare with current": "Comparar con Actual",
    "Compare with incoming": "Comparar con Entrante",
    "Result against current": "Resultado frente a Actual",
    "Result against incoming": "Resultado frente a Entrante",
    "Result": "Resultado",
    "Review notes ({count})": "Revisar notas ({count})",
    "The build moved {element} to meet {shapes}":
        "Al generar, {element} se movió para llegar a {shapes}",
    "{element} does not meet {shapes}; the build could not repair it":
        "{element} no llega a {shapes}; al generar no se pudo reparar",
    "The build moved {element} off {shapes}": "Al generar, {element} se apartó de {shapes}",
    "The build moved {element} off {shapes} and made room by shifting {shifted}":
        "Al generar, {element} se apartó de {shapes} y se hizo sitio desplazando {shifted}",
    "The build moved {element} off {shapes} and grew {grown} to hold it":
        "Al generar, {element} se apartó de {shapes} y {grown} se amplió para contenerlo",
    "The build moved {element} off {shapes}, grew {grown} to hold it and shifted {shifted}":
        "Al generar, {element} se apartó de {shapes}, {grown} se amplió para contenerlo y se desplazó {shifted}",
    "{first} and {second} lie on top of each other; the build could not repair it":
        "{first} y {second} están uno encima del otro; al generar no se pudo reparar",
    "The build moved {element} around {shapes}":
        "Al generar, {element} se movió para rodear {shapes}",
    "{element} runs through {shapes}; the build could not repair it":
        "{element} pasa por {shapes}; al generar no se pudo reparar",
    "The build moved {element} into {shapes}": "Al generar, {element} se movió dentro de {shapes}",
    "The build grew {shapes} to hold {element}":
        "Al generar, {shapes} se amplió para contener {element}",
    "The build grew {shapes} to hold {element} and shifted {shifted}":
        "Al generar, {shapes} se amplió para contener {element} y se desplazó {shifted}",
    "{element} lies outside {shapes}; the build could not repair it":
        "{element} está fuera de {shapes}; al generar no se pudo reparar",
    "{element} is not on the border of {host}": "{element} no está en el borde de {host}",
    "The build moved {element} below the other lanes and grew {grown} to hold it":
        "Al generar, {element} se movió debajo de los demás carriles y {grown} se amplió para contenerlo",
    "The build moved {element} below the other lanes, grew {grown} to hold it and shifted {shifted}":
        "Al generar, {element} se movió debajo de los demás carriles, {grown} se amplió para contenerlo y se desplazó {shifted}",
    "{first} and {second} overlap; the build could not repair it":
        "{first} y {second} se superponen; al generar no se pudo reparar",
    "{element} is kept without the flows the other side removed with it: {connections}":
        "{element} se conserva sin los flujos que el otro lado eliminó con él: {connections}",
    "{element} is kept without the boundary event the other side removed with it: {elements}":
        "{element} se conserva sin el evento de borde que el otro lado eliminó con él: {elements}",
    "{element} is kept without the {count} elements the other side removed with it: {elements}":
        "{element} se conserva sin los {count} elementos que el otro lado eliminó con él: {elements}",
    "{flow} is kept but is no longer the default flow of {element}":
        "{flow} se conserva, pero ya no es el flujo predeterminado de {element}",
    "{flow} is kept, but {element} keeps {keptDefault} as its default flow":
        "{flow} se conserva, pero {element} mantiene {keptDefault} como su flujo predeterminado",
    "The file's {attribute} differs between the sides; current's is kept":
        "El atributo {attribute} del archivo difiere entre los lados; se conserva el de Actual",
    "{element} is left out of the drawing: no diagram shows both {source} and {target}":
        "{element} queda fuera del dibujo: ningún diagrama muestra a la vez {source} y {target}",
    "{element} is left out of the drawing: it lacks a source or a target":
        "{element} queda fuera del dibujo: le falta un origen o un destino",
    "1 conflict left": "1 conflicto pendiente",
    "{count} conflicts left": "{count} conflictos pendientes",
    "Elements of this version the result keeps as they are here.":
        "Elementos de esta versión que el resultado conserva tal como están aquí.",
    "Elements of this version the result takes from the other version, or leaves out as the other version removed them.":
        "Elementos de esta versión que el resultado toma de la otra versión, o deja fuera porque la otra versión los eliminó.",
    "Open conflicts on elements this version has.":
        "Conflictos abiertos en elementos que tiene esta versión.",
    "Elements only the other version has are counted on the other pane only.":
        "Los elementos que solo tiene la otra versión se cuentan solo en el otro panel.",
    "More actions": "Más acciones",
    "This step has no shape, so it is listed here.":
        "Este paso no tiene forma, por eso aparece aquí.",
    "Not visible in the diagram ({count})": "No visibles en el diagrama ({count})",
    "1 open conflict not visible in the diagram": "1 conflicto abierto no visible en el diagrama",
    "{count} open conflicts not visible in the diagram":
        "{count} conflictos abiertos no visibles en el diagrama",
    "Keep current with everything inside": "Conservar Actual con todo su contenido",
    "Keep incoming with everything inside": "Conservar Entrante con todo su contenido",
    "Leave out": "Dejar fuera",
    "Also keep what was removed with it": "Conservar también lo que se eliminó con él",
    "Keep it as current has it": "Conservarlo como lo tiene Actual",
    "Keep it as incoming has it": "Conservarlo como lo tiene Entrante",
    "Keep it and everything inside as current has them":
        "Conservarlo con todo su contenido como lo tiene Actual",
    "Keep it and everything inside as incoming has them":
        "Conservarlo con todo su contenido como lo tiene Entrante",
    "Keep it and every pool with its process as current has them":
        "Conservarlo con cada pool y su proceso como los tiene Actual",
    "Keep it and every pool with its process as incoming has them":
        "Conservarlo con cada pool y su proceso como los tiene Entrante",
    "Leave it out, as current removed it": "Dejarlo fuera, ya que Actual lo eliminó",
    "Leave it out, as current doesn't have it": "Dejarlo fuera, ya que Actual no lo tiene",
    "Leave it out, as incoming removed it": "Dejarlo fuera, ya que Entrante lo eliminó",
    "Leave it out, as incoming doesn't have it": "Dejarlo fuera, ya que Entrante no lo tiene",
    "Go back to what the merge decided by itself": "Volver a lo que la fusión decidió por sí misma",
    "none": "sin valor",
    "and other content": "y otro contenido",
    "Removed in current": "Eliminado en Actual",
    "Not in current": "No está en Actual",
    "Removed in incoming": "Eliminado en Entrante",
    "Not in incoming": "No está en Entrante",
    "Kept from current with everything inside: {element}":
        "Conservado de Actual con todo su contenido: {element}",
    "Kept from incoming with everything inside: {element}":
        "Conservado de Entrante con todo su contenido: {element}",
    "Kept from current with what was removed with it: {element}":
        "Conservado de Actual con lo que se eliminó con él: {element}",
    "Kept from incoming with what was removed with it: {element}":
        "Conservado de Entrante con lo que se eliminó con él: {element}",
    "Left out: {element}, as current removed it":
        "Dejado fuera: {element}, ya que Actual lo eliminó",
    "Left out: {element}, as current doesn't have it":
        "Dejado fuera: {element}, ya que Actual no lo tiene",
    "Left out: {element}, as incoming removed it":
        "Dejado fuera: {element}, ya que Entrante lo eliminó",
    "Left out: {element}, as incoming doesn't have it":
        "Dejado fuera: {element}, ya que Entrante no lo tiene",
    "Took back the pick. {element} is an open conflict again.":
        "Se retiró la elección. {element} vuelve a ser un conflicto abierto.",
    "Can't keep {element}": "No se puede conservar {element}",
    "Can't leave out {element}": "No se puede dejar fuera {element}",
    "Can't take back the pick of {element}": "No se puede retirar la elección de {element}",
    "Nothing blocks keeping {element} now": "Ya nada impide conservar {element}",
    "Nothing blocks leaving out {element} now": "Ya nada impide dejar fuera {element}",
    "Nothing blocks taking back the pick of {element} now":
        "Ya nada impide retirar la elección de {element}",
    "{element} needs {target}; no version has it":
        "{element} necesita {target}; ninguna versión lo tiene",
    "{element} needs {target}; your pick takes a side without it":
        "{element} necesita {target}; su elección toma un lado sin él",
    "{element} needs a part of {target}; your pick takes a side without it":
        "{element} necesita una parte de {target}; su elección toma un lado sin ella",
    "{element} needs {target}; this pick drops it":
        "{element} necesita {target}; esta elección lo descarta",
    "{element} needs a part of {target} this pick leaves out":
        "{element} necesita una parte de {target} que esta elección deja fuera",
    "{element} needs {target}; this side lacks it":
        "{element} necesita {target}; este lado no lo tiene",
    "{element} needs a part of {target}; this side lacks it":
        "{element} necesita una parte de {target}; este lado no la tiene",
    "{element} needs {target}; the result leaves it out":
        "{element} necesita {target}; el resultado lo deja fuera",
    "{element} needs a part of {target} the kept version lacks":
        "{element} necesita una parte de {target} que falta en la versión conservada",
    "Your pick of {element} needs {target}": "Su elección de {element} necesita {target}",
    "{element} and {target} have a pool of the same process":
        "{element} y {target} tienen un pool del mismo proceso",
    "{element} needs it; no version has it": "{element} lo necesita; ninguna versión lo tiene",
    "{element} needs it; your pick takes a side without it":
        "{element} lo necesita; su elección toma un lado sin él",
    "{element} needs a part of it; your pick takes a side without it":
        "{element} necesita una parte de él; su elección toma un lado sin ella",
    "{element} needs it": "{element} lo necesita",
    "{element} needs a part of it this pick leaves out":
        "{element} necesita una parte de él que esta elección deja fuera",
    "{element} needs it; this side lacks it": "{element} lo necesita; este lado no lo tiene",
    "{element} needs a part of it; this side lacks it":
        "{element} necesita una parte de él; este lado no la tiene",
    "{element} needs a part of it the kept version lacks":
        "{element} necesita una parte de él que falta en la versión conservada",
    "Your pick of {element} needs it": "Su elección de {element} lo necesita",
    "This pick brings in {element}, which needs it":
        "Esta elección incorpora {element}, que lo necesita",
    "{element} holds the same ID": "{element} tiene el mismo ID",
    "{element} has a pool of the same process": "{element} tiene un pool del mismo proceso",
    "and {count} more": "y {count} más",
    "Data store": "Almacén de datos",
    "Item definition": "Definición de ítem",
    "Category": "Categoría",
    "Interface": "Interfaz",
    "End point": "Punto final",
    "Partner entity": "Entidad asociada",
    "Partner role": "Rol asociado",
    "Correlation property": "Propiedad de correlación",
    "Global task": "Tarea global",
    "Flow from {source} to {target}": "Flujo de {source} a {target}",
    "Both sides changed the layout of {elements}; current's is kept":
        "Ambos lados cambiaron la disposición de {elements}; se conserva la de Actual",
    "Both sides changed the layout of {elements}; incoming's is kept":
        "Ambos lados cambiaron la disposición de {elements}; se conserva la de Entrante",
    "by hand": "a mano",
    "Edit again": "Editar de nuevo",
    "Keep my XML": "Conservar mi XML",
    "Keep the XML merged before": "Conservar el XML combinado antes",
    "Merge XML": "Combinar XML",
    "Merge both sides' changes to its XML by hand in a merge editor":
        "Combinar a mano los cambios de ambos lados en su XML en un editor de combinación",
    "Keep current and merge XML": "Conservar Actual y combinar XML",
    "Keep incoming and merge XML": "Conservar Entrante y combinar XML",
    "Edit merged XML": "Editar el XML combinado",
    "Change the XML you merged by hand": "Cambiar el XML que combinó a mano",
    "Keep current's version": "Conservar la versión de Actual",
    "Keep incoming's version": "Conservar la versión de Entrante",
    "Drop it and pick": "Descartarlo y elegir",
    "Drop it and leave out": "Descartarlo y dejar fuera",
    "Drop it and undo": "Descartarlo y retirar",
    "Kept from current and merged by hand, your pick":
        "Conservado de Actual y combinado a mano, su elección",
    "Kept from incoming and merged by hand, your pick":
        "Conservado de Entrante y combinado a mano, su elección",
    "Kept from current with everything inside and merged by hand, your pick":
        "Conservado de Actual con todo su contenido y combinado a mano, su elección",
    "Kept from incoming with everything inside and merged by hand, your pick":
        "Conservado de Entrante con todo su contenido y combinado a mano, su elección",
    "Kept from current with what was removed with it and merged by hand, your pick":
        "Conservado de Actual con lo que se eliminó con él y combinado a mano, su elección",
    "Kept from incoming with what was removed with it and merged by hand, your pick":
        "Conservado de Entrante con lo que se eliminó con él y combinado a mano, su elección",
    "Merged by hand: {element}": "Combinado a mano: {element}",
    "Closed without saving: {element} is unchanged": "Cerrado sin guardar: {element} no cambia",
    "This drops the XML you merged by hand for {elements}":
        "Esto descarta el XML que combinó a mano para {elements}",
    "The XML of {element} still holds conflict markers":
        "El XML de {element} aún contiene marcadores de conflicto",
    "The XML of {element} doesn't parse": "El XML de {element} no se puede analizar",
    "The XML of {element} must hold one element":
        "El XML de {element} debe contener un solo elemento",
    "The XML of {element} changes its type": "El XML de {element} cambia su tipo",
    "The XML of {element} changes its ID": "El XML de {element} cambia su ID",
    "The XML of {element} holds elements of their own":
        "El XML de {element} contiene elementos propios",
    "The XML of {element} goes beyond its own content":
        "El XML de {element} va más allá de su propio contenido",
    "The XML of {element} names an element of the wrong type":
        "El XML de {element} nombra un elemento del tipo incorrecto",
    "The XML of {element} uses an unknown namespace":
        "El XML de {element} usa un espacio de nombres desconocido",
    "The engine doesn't take the XML of {element}": "El motor no acepta el XML de {element}",
    "The XML of {element} changes what follows the pick":
        "El XML de {element} cambia lo que sigue a la elección",
    "The XML of {element} names an element no version has":
        "El XML de {element} nombra un elemento que ninguna versión tiene",
    "The XML of {element} names an element the result leaves out":
        "El XML de {element} nombra un elemento que el resultado deja fuera",
    "The XML of {element} would change other decisions":
        "El XML de {element} cambiaría otras decisiones",
    "The pick of {element} changed while you merged it":
        "La elección de {element} cambió mientras lo combinaba",
    "Resolve each conflict and remove its markers, then save.":
        "Resuelva cada conflicto y quite sus marcadores; luego guarde.",
    "The parser says: {detail}": "El analizador dice: {detail}",
    "It holds {count} elements at its top level.":
        "Contiene {count} elementos en su nivel superior.",
    "It is a {found} now; keep it a {expected}.":
        "Ahora es un {found}; manténgalo como {expected}.",
    "Its ID is {found} now; keep {expected}.": "Su ID ahora es {found}; mantenga {expected}.",
    "It has no ID now; keep {expected}.": "Ahora no tiene ID; mantenga {expected}.",
    "Merge these on their own, with a pick: {elements}":
        "Combine estos por separado, con una elección: {elements}",
    "Only its attributes, documentation and extension elements merge here, not {properties}.":
        "Aquí solo se combinan sus atributos, documentación y elementos de extensión, no {properties}.",
    "{target} as {property}, which takes a {expected}":
        "{target} como {property}, que admite un {expected}",
    "No version declares {namespaces}.": "Ninguna versión declara {namespaces}.",
    "The engine says: {detail}": "El motor dice: {detail}",
    "{properties} follow the side you picked.": "{properties} siguen al lado que eligió.",
    "No version has {elements}.": "Ninguna versión tiene {elements}.",
    "The result leaves out {elements}.": "El resultado deja fuera {elements}.",
    "It would change the decisions on {elements}.": "Cambiaría las decisiones sobre {elements}.",
    "It is no longer picked on the side you merged it for.":
        "Ya no está elegido en el lado para el que lo combinó.",
};

export default dictionary;
