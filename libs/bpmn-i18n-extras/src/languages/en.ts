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
        "The linked form is missing or invalid. Check the form reference.",
    "Preview linked form": "Preview linked form",
    "Fit diagram to view": "Fit diagram to view",
    "Linked form preview": "Linked form preview",
    "Refresh": "Refresh",
    "Close form preview": "Close form preview",
    "Read-only preview of the saved local form.": "Read-only preview of the saved local form.",
    "Saved form loaded.": "Saved form loaded.",
    "Open a workspace folder to preview linked forms.":
        "Open a workspace folder to preview linked forms.",
    "No saved local form matches this reference. Refresh to try again.":
        "No saved local form matches this reference. Refresh to try again.",
    "Multiple saved forms match this reference. Choose a form to preview.":
        "Multiple saved forms match this reference. Choose a form to preview.",
    "The saved form could not be read. Refresh to try again.":
        "The saved form could not be read. Refresh to try again.",
    "The host did not answer. Refresh to try again.":
        "The host did not answer. Refresh to try again.",
    "The saved form is invalid or unsupported. Open it in the form editor.":
        "The saved form is invalid or unsupported. Open it in the form editor.",
    "The form preview could not be loaded. Refresh to try again.":
        "The form preview could not be loaded. Refresh to try again.",
    "Changes": "Changes",
    "No changes": "No changes",
    "Show all": "Show all",
    "Show XML changes": "Show XML changes",
    "Old version": "Old version",
    "New version": "New version",
    "Not in this version": "Not in this version",
    "It was removed. The version on the left shows it.":
        "It was removed. The version on the left shows it.",
    "It is new. The version on the right shows it.":
        "It is new. The version on the right shows it.",
    "A form is either a form id or an external reference, not both.":
        "A form is either a form id or an external reference, not both.",
    "A property cannot depend on itself.": "A property cannot depend on itself.",
    "A regular expression the value must match.": "A regular expression the value must match.",
    "Add Choice": "Add Choice",
    "Add Condition": "Add Condition",
    "Add Group": "Add Group",
    "Add a property for each field users fill in.": "Add a property for each field users fill in.",
    "Add an element type": "Add an element type",
    "Add an element type…": "Add an element type…",
    "Add it": "Add it",
    "Also set in the JSON: {keys}": "Also set in the JSON: {keys}",
    "Always written; users do not see the field.": "Always written; users do not see the field.",
    'Another property already has the id "{id}".': 'Another property already has the id "{id}".',
    "Applies to": "Applies to",
    "Apply Template": "Apply Template",
    "Attribute": "Attribute",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Automated work carried out by a Java delegate, expression, or external task",
    "Automated work carried out by a system": "Automated work carried out by a system",
    "BPMN attribute": "BPMN attribute",
    "Basics": "Basics",
    "Being edited in": "Being edited in",
    "Called process": "Called process",
    "Camunda properties, templates and lint": "Camunda properties, templates and lint",
    "Checked by default.": "Checked by default.",
    "Child process": "Child process",
    "Choice name": "Choice name",
    "Choice value": "Choice value",
    "Choices": "Choices",
    "Choose a property": "Choose a property",
    "Clear search": "Clear search",
    "Close": "Close",
    "Collapse": "Collapse",
    "Create an element template": "Create an element template",
    "Create template": "Create template",
    "Creates element": "Creates element",
    "Delegate": "Delegate",
    "Delete group": "Delete group",
    "Delete property": "Delete property",
    "Design": "Design",
    "Documentation link": "Documentation link",
    "Duplicate property": "Duplicate property",
    "Editable": "Editable",
    "Element Templates": "Element Templates",
    "Element actions": "Element actions",
    "Elements": "Elements",
    "Engine": "Engine",
    "Engine-neutral modeling": "Engine-neutral modeling",
    "Enter a number.": "Enter a number.",
    "Event definition": "Event definition",
    "Expand": "Expand",
    "Extension property": "Extension property",
    "Favourites": "Favourites",
    "Fix it in the JSON editor; until then the builder is read-only.":
        "Fix it in the JSON editor; until then the builder is read-only.",
    "Fixed value": "Fixed value",
    "For example: Send mail": "For example: Send mail",
    "Groups": "Groups",
    "Groups put properties under their own heading in the properties panel.":
        "Groups put properties under their own heading in the properties panel.",
    "Help text below the field.": "Help text below the field.",
    "Hide preview": "Hide preview",
    "Human": "Human",
    "Implement": "Implement",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.",
    "Is empty": "Is empty",
    "Is one of": "Is one of",
    "Is shown": "Is shown",
    "Java delegate": "Java delegate",
    "Leave the value out of the XML while it is empty.":
        "Leave the value out of the XML while it is empty.",
    "Lets conditions refer to this property.": "Lets conditions refer to this property.",
    "Linked from the template in the properties panel.":
        "Linked from the template in the properties panel.",
    "Maximum length": "Maximum length",
    "Message subscription": "Message subscription",
    "Minimum length": "Minimum length",
    "Mode": "Mode",
    "Mode: {mode}": "Mode: {mode}",
    "Move down": "Move down",
    "Move up": "Move up",
    "Name or code": "Name or code",
    "No FEEL": "No FEEL",
    'No group has the id "{id}"; the property shows under "Custom properties".':
        'No group has the id "{id}"; the property shows under "Custom properties".',
    "No groups match your search.": "No groups match your search.",
    "No groups yet.": "No groups yet.",
    "No matches in other models": "No matches in other models",
    "No properties match your search.": "No properties match your search.",
    "No properties yet.": "No properties yet.",
    'No property has the id "{id}".': 'No property has the id "{id}".',
    "No settings match your search.": "No settings match your search.",
    "No templates found": "No templates found",
    "No value": "No value",
    "No visible parameters": "No visible parameters",
    "None": "None",
    "Operator": "Operator",
    "Optional": "Optional",
    "Other": "Other",
    "Parts of the template": "Parts of the template",
    "Pattern": "Pattern",
    "Pattern message": "Pattern message",
    "Pick the engine and the element the template is for. You can change both later.":
        "Pick the engine and the element the template is for. You can change both later.",
    "Placeholder": "Placeholder",
    "Placement": "Placement",
    "Preview": "Preview",
    "Problems": "Problems",
    "Properties join the group with this id.": "Properties join the group with this id.",
    "Property": "Property",
    "Raise it whenever you change a template that is in use.":
        "Raise it whenever you change a template that is in use.",
    "Read-only": "Read-only",
    "Remove choice": "Remove choice",
    "Remove condition": "Remove condition",
    "Remove {value}": "Remove {value}",
    "Required": "Required",
    "Search failed": "Search failed",
    "Search groups": "Search groups",
    "Search other models": "Search other models",
    "Search properties": "Search properties",
    "Search template settings": "Search template settings",
    "Search templates...": "Search templates...",
    "Search...": "Search...",
    "Searching…": "Searching…",
    "Select a template to see its details": "Select a template to see its details",
    "Show": "Show",
    "Show only when": "Show only when",
    "Show preview": "Show preview",
    "Shown above the field.": "Shown above the field.",
    "Shown from the info icon next to the field.": "Shown from the info icon next to the field.",
    "Shown in the empty field.": "Shown in the empty field.",
    "Shown when the value does not match the pattern.":
        "Shown when the value does not match the pattern.",
    "Shown when users pick a template.": "Shown when users pick a template.",
    "Shown with the name when users pick a template.":
        "Shown with the name when users pick a template.",
    "Task Type": "Task Type",
    "Task header": "Task header",
    "The JSON is invalid: {message}": "The JSON is invalid: {message}",
    "The builder does not edit {binding} bindings yet; edit this one in JSON.":
        "The builder does not edit {binding} bindings yet; edit this one in JSON.",
    "The builder opens once the file holds a valid element template.":
        "The builder opens once the file holds a valid element template.",
    "The choice new elements start with.": "The choice new elements start with.",
    "The element it is applied to": "The element it is applied to",
    "The elements users can apply the template to.":
        "The elements users can apply the template to.",
    'The engine decides which bindings the template can use. Your choice is saved as its "$schema".':
        'The engine decides which bindings the template can use. Your choice is saved as its "$schema".',
    "The event definition the created event gets.": "The event definition the created event gets.",
    "The fewest characters users may enter.": "The fewest characters users may enter.",
    "The field shows only while all these conditions hold.":
        "The field shows only while all these conditions hold.",
    "The group the field appears in.": "The group the field appears in.",
    "The group's heading in the properties panel.": "The group's heading in the properties panel.",
    "The kind of field users see.": "The kind of field users see.",
    "The most characters users may enter.": "The most characters users may enter.",
    "The options users pick from.": "The options users pick from.",
    "The preview shows the last template without errors.":
        "The preview shows the last template without errors.",
    "The template as the properties panel shows it. Values entered here are not saved.":
        "The template as the properties panel shows it. Values entered here are not saved.",
    'The template has no "$schema" that names its engine.':
        'The template has no "$schema" that names its engine.',
    "The value is FEEL": "The value is FEEL",
    "The value is an expression.": "The value is an expression.",
    "The value must be one of the choices.": "The value must be one of the choices.",
    "The value new elements start with.": "The value new elements start with.",
    "This binding needs a zeebe:userTask property.":
        "This binding needs a zeebe:userTask property.",
    "This binding needs one of the element types {types}.":
        "This binding needs one of the element types {types}.",
    "This binding needs the called process id.": "This binding needs the called process id.",
    "This binding needs the decision id.": "This binding needs the decision id.",
    "This binding needs the element type {type}.": "This binding needs the element type {type}.",
    "This binding needs the result variable.": "This binding needs the result variable.",
    "This binding needs the script expression.": "This binding needs the script expression.",
    "This file does not contain an element template.":
        "This file does not contain an element template.",
    "Tooltip": "Tooltip",
    "Try a different search term": "Try a different search term",
    "Turns the element into this type when the template is applied.":
        "Turns the element into this type when the template is applied.",
    "Unique together with the version.": "Unique together with the version.",
    "Unlabeled property": "Unlabeled property",
    "Unnamed": "Unnamed",
    "Unnamed group": "Unnamed group",
    "Untitled template": "Untitled template",
    "Users can change the value.": "Users can change the value.",
    "Users may enter FEEL": "Users may enter FEEL",
    "Users must fill in a value.": "Users must fill in a value.",
    "View": "View",
    "Where the value is written.": "Where the value is written.",
    "Whether users may or must enter a FEEL expression.":
        "Whether users may or must enter a FEEL expression.",
    "Which engine is this template for?": "Which engine is this template for?",
    "a, b, c": "a, b, c",
    "caught by {elements}": "caught by {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "optional",
    "read-only": "read-only",
    "required": "required",
    "thrown by {elements}": "thrown by {elements}",
    "{count} properties": "{count} properties",
    "{count} property": "{count} property",
    "1 Error": "1 Error",
    "1 Warning": "1 Warning",
    "{count} Errors": "{count} Errors",
    "{count} Warnings": "{count} Warnings",
    "{count} in {tab}": "{count} in {tab}",
    "{position} of {count}": "{position} of {count}",
    "{type}: no preview yet": "{type}: no preview yet",
    "A Hidden property should have a value.": "A Hidden property should have a value.",
    "Activity": "Activity",
    'Another group already has the id "{id}".': 'Another group already has the id "{id}".',
    "Edit in the JSON for now": "Edit in the JSON for now",
    "Enter an id.": "Enter an id.",
    "For other element types": "For other element types",
    "Optional on an input mapping is deprecated; from Camunda 8.8 an empty input mapping is null.":
        "Optional on an input mapping is deprecated; from Camunda 8.8 an empty input mapping is null.",
    "Remove FEEL": "Remove FEEL",
    "Remove Optional": "Remove Optional",
    "Set the element type to {type}": "Set the element type to {type}",
    "Templates for {type} cannot be previewed yet.":
        "Templates for {type} cannot be previewed yet.",
    "This binding is deprecated; a task definition with the attribute type replaces it.":
        "This binding is deprecated; a task definition with the attribute type replaces it.",
    "This binding only works on: {types}.": "This binding only works on: {types}.",
    "This change was not written: the JSON around {path} is not what the builder expects. Fix it in the JSON editor.":
        "This change was not written: the JSON around {path} is not what the builder expects. Fix it in the JSON editor.",
    "Use the task definition": "Use the task definition",
    "Users cannot enter FEEL into a field they cannot edit.":
        "Users cannot enter FEEL into a field they cannot edit.",
    "Generate from name": "Generate from name",
    "Review all IDs…": "Review all IDs…",
    "Rename the ID to {id}": "Rename the ID to {id}",
    "The ID already follows the name.": "The ID already follows the name.",
    "Add a name to generate the ID from it.": "Add a name to generate the ID from it.",
    "Current": "Current",
    "Incoming": "Incoming",
    "your branch": "your branch",
    "other branch": "other branch",
    "your commit": "your commit",
    "your stash": "your stash",
    "Taken from this side": "Taken from this side",
    "Taken from the other side": "Taken from the other side",
    "Conflict": "Conflict",
    "Step through": "Step through",
    "Open conflicts": "Open conflicts",
    "All merged elements": "All merged elements",
    "No open conflicts": "No open conflicts",
    "1 open conflict": "1 open conflict",
    "{count} open conflicts": "{count} open conflicts",
    "Keep everything inside": "Keep everything inside",
    "Undo pick": "Undo pick",
    "Pulled in:": "Pulled in:",
    "Dropped:": "Dropped:",
    "Open again:": "Open again:",
    "Keep current": "Keep current",
    "Keep incoming": "Keep incoming",
    "Kept from current, your pick": "Kept from current, your pick",
    "Kept from incoming, your pick": "Kept from incoming, your pick",
    "Kept from current with everything inside, your pick":
        "Kept from current with everything inside, your pick",
    "Kept from incoming with everything inside, your pick":
        "Kept from incoming with everything inside, your pick",
    "Kept from current with what was removed with it, your pick":
        "Kept from current with what was removed with it, your pick",
    "Kept from incoming with what was removed with it, your pick":
        "Kept from incoming with what was removed with it, your pick",
    "Kept from current: {element}": "Kept from current: {element}",
    "Kept from incoming: {element}": "Kept from incoming: {element}",
    "This pick brings in {element}, which needs {target}":
        "This pick brings in {element}, which needs {target}",
    "{element} and {target} hold the same ID": "{element} and {target} hold the same ID",
    "Also keep the flow current removed with it": "Also keep the flow current removed with it",
    "Also keep the {count} flows current removed with it":
        "Also keep the {count} flows current removed with it",
    "Also keep the flow incoming removed with it": "Also keep the flow incoming removed with it",
    "Also keep the {count} flows incoming removed with it":
        "Also keep the {count} flows incoming removed with it",
    "Also keep the boundary event current removed with it":
        "Also keep the boundary event current removed with it",
    "Also keep the {count} elements current removed with it":
        "Also keep the {count} elements current removed with it",
    "Also keep the boundary event incoming removed with it":
        "Also keep the boundary event incoming removed with it",
    "Also keep the {count} elements incoming removed with it":
        "Also keep the {count} elements incoming removed with it",
    "Took back the pick of {element}": "Took back the pick of {element}",
    "Build": "Build",
    "Notes of the build": "Notes of the build",
    "Compare with current": "Compare with current",
    "Compare with incoming": "Compare with incoming",
    "Result against current": "Result against current",
    "Result against incoming": "Result against incoming",
    "Result": "Result",
    "Review notes ({count})": "Review notes ({count})",
    "The build moved {element} to meet {shapes}": "The build moved {element} to meet {shapes}",
    "{element} does not meet {shapes}; the build could not repair it":
        "{element} does not meet {shapes}; the build could not repair it",
    "The build moved {element} off {shapes}": "The build moved {element} off {shapes}",
    "The build moved {element} off {shapes} and made room by shifting {shifted}":
        "The build moved {element} off {shapes} and made room by shifting {shifted}",
    "{first} and {second} lie on top of each other; the build could not repair it":
        "{first} and {second} lie on top of each other; the build could not repair it",
    "The build moved {element} around {shapes}": "The build moved {element} around {shapes}",
    "{element} runs through {shapes}; the build could not repair it":
        "{element} runs through {shapes}; the build could not repair it",
    "The build moved {element} into {shapes}": "The build moved {element} into {shapes}",
    "The build grew {shapes} to hold {element}": "The build grew {shapes} to hold {element}",
    "The build grew {shapes} to hold {element} and shifted {shifted}":
        "The build grew {shapes} to hold {element} and shifted {shifted}",
    "{element} lies outside {shapes}; the build could not repair it":
        "{element} lies outside {shapes}; the build could not repair it",
    "{element} is not on the border of {host}": "{element} is not on the border of {host}",
    "The build moved {element} below the other lanes and grew {grown} to hold it":
        "The build moved {element} below the other lanes and grew {grown} to hold it",
    "The build moved {element} below the other lanes, grew {grown} to hold it and shifted {shifted}":
        "The build moved {element} below the other lanes, grew {grown} to hold it and shifted {shifted}",
    "{first} and {second} overlap; the build could not repair it":
        "{first} and {second} overlap; the build could not repair it",
    "{element} is kept without the flows the other side removed with it: {connections}":
        "{element} is kept without the flows the other side removed with it: {connections}",
    "{element} is kept without the boundary event the other side removed with it: {elements}":
        "{element} is kept without the boundary event the other side removed with it: {elements}",
    "{element} is kept without the {count} elements the other side removed with it: {elements}":
        "{element} is kept without the {count} elements the other side removed with it: {elements}",
    "{flow} is kept but is no longer the default flow of {element}":
        "{flow} is kept but is no longer the default flow of {element}",
    "{flow} is kept, but {element} keeps {keptDefault} as its default flow":
        "{flow} is kept, but {element} keeps {keptDefault} as its default flow",
    "The file's {attribute} differs between the sides; current's is kept":
        "The file's {attribute} differs between the sides; current's is kept",
    "{element} is left out of the drawing: no diagram shows both {source} and {target}":
        "{element} is left out of the drawing: no diagram shows both {source} and {target}",
    "{element} is left out of the drawing: it lacks a source or a target":
        "{element} is left out of the drawing: it lacks a source or a target",
    "1 conflict left": "1 conflict left",
    "{count} conflicts left": "{count} conflicts left",
    "Elements of this version the result keeps as they are here.":
        "Elements of this version the result keeps as they are here.",
    "Elements of this version the result takes from the other version, or leaves out as the other version removed them.":
        "Elements of this version the result takes from the other version, or leaves out as the other version removed them.",
    "Open conflicts on elements this version has.": "Open conflicts on elements this version has.",
    "Elements only the other version has are counted on the other pane only.":
        "Elements only the other version has are counted on the other pane only.",
    "More actions": "More actions",
    "This step has no shape, so it is listed here.":
        "This step has no shape, so it is listed here.",
    "Not visible in the diagram ({count})": "Not visible in the diagram ({count})",
    "1 open conflict not visible in the diagram": "1 open conflict not visible in the diagram",
    "{count} open conflicts not visible in the diagram":
        "{count} open conflicts not visible in the diagram",
    "Keep current with everything inside": "Keep current with everything inside",
    "Keep incoming with everything inside": "Keep incoming with everything inside",
    "Leave out": "Leave out",
    "Also keep what was removed with it": "Also keep what was removed with it",
    "Keep it as current has it": "Keep it as current has it",
    "Keep it as incoming has it": "Keep it as incoming has it",
    "Keep it and everything inside as current has them":
        "Keep it and everything inside as current has them",
    "Keep it and everything inside as incoming has them":
        "Keep it and everything inside as incoming has them",
    "Keep it and every pool with its process as current has them":
        "Keep it and every pool with its process as current has them",
    "Keep it and every pool with its process as incoming has them":
        "Keep it and every pool with its process as incoming has them",
    "Leave it out, as current removed it": "Leave it out, as current removed it",
    "Leave it out, as current doesn't have it": "Leave it out, as current doesn't have it",
    "Leave it out, as incoming removed it": "Leave it out, as incoming removed it",
    "Leave it out, as incoming doesn't have it": "Leave it out, as incoming doesn't have it",
    "Go back to what the merge decided by itself": "Go back to what the merge decided by itself",
    "none": "none",
    "and other content": "and other content",
    "Removed in current": "Removed in current",
    "Not in current": "Not in current",
    "Removed in incoming": "Removed in incoming",
    "Not in incoming": "Not in incoming",
    "Kept from current with everything inside: {element}":
        "Kept from current with everything inside: {element}",
    "Kept from incoming with everything inside: {element}":
        "Kept from incoming with everything inside: {element}",
    "Kept from current with what was removed with it: {element}":
        "Kept from current with what was removed with it: {element}",
    "Kept from incoming with what was removed with it: {element}":
        "Kept from incoming with what was removed with it: {element}",
    "Left out: {element}, as current removed it": "Left out: {element}, as current removed it",
    "Left out: {element}, as current doesn't have it":
        "Left out: {element}, as current doesn't have it",
    "Left out: {element}, as incoming removed it": "Left out: {element}, as incoming removed it",
    "Left out: {element}, as incoming doesn't have it":
        "Left out: {element}, as incoming doesn't have it",
    "Took back the pick. {element} is an open conflict again.":
        "Took back the pick. {element} is an open conflict again.",
    "Can't keep {element}": "Can't keep {element}",
    "Can't leave out {element}": "Can't leave out {element}",
    "Can't take back the pick of {element}": "Can't take back the pick of {element}",
    "Nothing blocks keeping {element} now": "Nothing blocks keeping {element} now",
    "Nothing blocks leaving out {element} now": "Nothing blocks leaving out {element} now",
    "Nothing blocks taking back the pick of {element} now":
        "Nothing blocks taking back the pick of {element} now",
    "{element} needs {target}; no version has it": "{element} needs {target}; no version has it",
    "{element} needs {target}; your pick takes a side without it":
        "{element} needs {target}; your pick takes a side without it",
    "{element} needs a part of {target}; your pick takes a side without it":
        "{element} needs a part of {target}; your pick takes a side without it",
    "{element} needs {target}; this pick drops it": "{element} needs {target}; this pick drops it",
    "{element} needs a part of {target} this pick leaves out":
        "{element} needs a part of {target} this pick leaves out",
    "{element} needs {target}; this side lacks it": "{element} needs {target}; this side lacks it",
    "{element} needs a part of {target}; this side lacks it":
        "{element} needs a part of {target}; this side lacks it",
    "{element} needs {target}; the result leaves it out":
        "{element} needs {target}; the result leaves it out",
    "{element} needs a part of {target} the kept version lacks":
        "{element} needs a part of {target} the kept version lacks",
    "Your pick of {element} needs {target}": "Your pick of {element} needs {target}",
    "{element} and {target} have a pool of the same process":
        "{element} and {target} have a pool of the same process",
    "{element} needs it; no version has it": "{element} needs it; no version has it",
    "{element} needs it; your pick takes a side without it":
        "{element} needs it; your pick takes a side without it",
    "{element} needs a part of it; your pick takes a side without it":
        "{element} needs a part of it; your pick takes a side without it",
    "{element} needs it": "{element} needs it",
    "{element} needs a part of it this pick leaves out":
        "{element} needs a part of it this pick leaves out",
    "{element} needs it; this side lacks it": "{element} needs it; this side lacks it",
    "{element} needs a part of it; this side lacks it":
        "{element} needs a part of it; this side lacks it",
    "{element} needs a part of it the kept version lacks":
        "{element} needs a part of it the kept version lacks",
    "Your pick of {element} needs it": "Your pick of {element} needs it",
    "This pick brings in {element}, which needs it":
        "This pick brings in {element}, which needs it",
    "{element} holds the same ID": "{element} holds the same ID",
    "{element} has a pool of the same process": "{element} has a pool of the same process",
    "and {count} more": "and {count} more",
    "Data store": "Data store",
    "Item definition": "Item definition",
    "Category": "Category",
    "Interface": "Interface",
    "End point": "End point",
    "Partner entity": "Partner entity",
    "Partner role": "Partner role",
    "Correlation property": "Correlation property",
    "Global task": "Global task",
    "Flow from {source} to {target}": "Flow from {source} to {target}",
    "Both sides changed the layout of {elements}; current's is kept":
        "Both sides changed the layout of {elements}; current's is kept",
    "Both sides changed the layout of {elements}; incoming's is kept":
        "Both sides changed the layout of {elements}; incoming's is kept",
    "by hand": "by hand",
    "Edit again": "Edit again",
    "Keep my XML": "Keep my XML",
    "Keep the XML merged before": "Keep the XML merged before",
    "Merge XML": "Merge XML",
    "Merge both sides' changes to its XML by hand in a merge editor":
        "Merge both sides' changes to its XML by hand in a merge editor",
    "Edit merged XML": "Edit merged XML",
    "Change the XML you merged by hand": "Change the XML you merged by hand",
    "Keep current's version": "Keep current's version",
    "Keep incoming's version": "Keep incoming's version",
    "Drop it and pick": "Drop it and pick",
    "Drop it and leave out": "Drop it and leave out",
    "Drop it and undo": "Drop it and undo",
    "Kept from current and merged by hand, your pick":
        "Kept from current and merged by hand, your pick",
    "Kept from incoming and merged by hand, your pick":
        "Kept from incoming and merged by hand, your pick",
    "Kept from current with everything inside and merged by hand, your pick":
        "Kept from current with everything inside and merged by hand, your pick",
    "Kept from incoming with everything inside and merged by hand, your pick":
        "Kept from incoming with everything inside and merged by hand, your pick",
    "Kept from current with what was removed with it and merged by hand, your pick":
        "Kept from current with what was removed with it and merged by hand, your pick",
    "Kept from incoming with what was removed with it and merged by hand, your pick":
        "Kept from incoming with what was removed with it and merged by hand, your pick",
    "Merged by hand: {element}": "Merged by hand: {element}",
    "Closed without saving: {element} is unchanged":
        "Closed without saving: {element} is unchanged",
    "This drops the XML you merged by hand for {elements}":
        "This drops the XML you merged by hand for {elements}",
    "The XML of {element} still holds conflict markers":
        "The XML of {element} still holds conflict markers",
    "The XML of {element} doesn't parse": "The XML of {element} doesn't parse",
    "The XML of {element} must hold one element": "The XML of {element} must hold one element",
    "The XML of {element} changes its type": "The XML of {element} changes its type",
    "The XML of {element} changes its ID": "The XML of {element} changes its ID",
    "The XML of {element} holds elements of their own":
        "The XML of {element} holds elements of their own",
    "The XML of {element} goes beyond its own content":
        "The XML of {element} goes beyond its own content",
    "The XML of {element} names an element of the wrong type":
        "The XML of {element} names an element of the wrong type",
    "The XML of {element} uses an unknown namespace":
        "The XML of {element} uses an unknown namespace",
    "The engine doesn't take the XML of {element}": "The engine doesn't take the XML of {element}",
    "The XML of {element} changes what follows the pick":
        "The XML of {element} changes what follows the pick",
    "The XML of {element} names an element no version has":
        "The XML of {element} names an element no version has",
    "The XML of {element} names an element the result leaves out":
        "The XML of {element} names an element the result leaves out",
    "The XML of {element} would change other decisions":
        "The XML of {element} would change other decisions",
    "The pick of {element} changed while you merged it":
        "The pick of {element} changed while you merged it",
    "Resolve each conflict and remove its markers, then save.":
        "Resolve each conflict and remove its markers, then save.",
    "The parser says: {detail}": "The parser says: {detail}",
    "It holds {count} elements at its top level.": "It holds {count} elements at its top level.",
    "It is a {found} now; keep it a {expected}.": "It is a {found} now; keep it a {expected}.",
    "Its ID is {found} now; keep {expected}.": "Its ID is {found} now; keep {expected}.",
    "It has no ID now; keep {expected}.": "It has no ID now; keep {expected}.",
    "Merge these on their own, with a pick: {elements}":
        "Merge these on their own, with a pick: {elements}",
    "Only its attributes, documentation and extension elements merge here, not {properties}.":
        "Only its attributes, documentation and extension elements merge here, not {properties}.",
    "{target} as {property}, which takes a {expected}":
        "{target} as {property}, which takes a {expected}",
    "No version declares {namespaces}.": "No version declares {namespaces}.",
    "The engine says: {detail}": "The engine says: {detail}",
    "{properties} follow the side you picked.": "{properties} follow the side you picked.",
    "No version has {elements}.": "No version has {elements}.",
    "The result leaves out {elements}.": "The result leaves out {elements}.",
    "It would change the decisions on {elements}.": "It would change the decisions on {elements}.",
    "It is no longer picked on the side you merged it for.":
        "It is no longer picked on the side you merged it for.",
};

export default dictionary;
