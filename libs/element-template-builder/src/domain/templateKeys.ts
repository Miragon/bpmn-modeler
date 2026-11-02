type Json = Readonly<Record<string, unknown>>;

/** In the order a person writes them, so a new key lands where it belongs. */
export const TEMPLATE_KEY_ORDER: readonly string[] = [
    "$schema",
    "name",
    "id",
    "version",
    "description",
    "documentationRef",
    "category",
    "icon",
    "keywords",
    "engines",
    "deprecated",
    "appliesTo",
    "elementType",
    "groups",
    "properties",
    "scopes",
    "entriesVisible",
];
export const PROPERTY_KEY_ORDER: readonly string[] = [
    "id",
    "label",
    "description",
    "tooltip",
    "type",
    "value",
    "placeholder",
    "optional",
    "feel",
    "language",
    "editable",
    "choices",
    "constraints",
    "group",
    "condition",
    "binding",
];
export const BINDING_KEY_ORDER: readonly string[] = [
    "type",
    "name",
    "property",
    "key",
    "source",
    "scriptFormat",
    "expression",
];

const GROUP_KEYS: readonly string[] = ["id", "label"];

// Keys of the lists above the builder has no field for.
const TEMPLATE_KEYS_LEFT_TO_JSON: readonly string[] = [
    "category",
    "icon",
    "keywords",
    "engines",
    "deprecated",
    "scopes",
    "entriesVisible",
];
const PROPERTY_KEYS_LEFT_TO_JSON: readonly string[] = ["language"];
// Only Camunda 8 properties can have them.
const PROPERTY_EXTRA_KEYS: readonly string[] = ["id", "tooltip", "optional", "feel", "condition"];

function otherKeys(object: Json, known: readonly string[]): string[] {
    return Object.keys(object).filter((key) => !known.includes(key));
}

/** The keys the builder leaves as they are, which the user can only change in the JSON. */
export function jsonOnlyTemplateKeys(template: Json): string[] {
    return otherKeys(
        template,
        TEMPLATE_KEY_ORDER.filter((key) => !TEMPLATE_KEYS_LEFT_TO_JSON.includes(key)),
    );
}

export function jsonOnlyPropertyKeys(property: Json, propertyExtras: boolean): string[] {
    return otherKeys(
        property,
        PROPERTY_KEY_ORDER.filter(
            (key) =>
                !PROPERTY_KEYS_LEFT_TO_JSON.includes(key) &&
                (propertyExtras || !PROPERTY_EXTRA_KEYS.includes(key)),
        ),
    );
}

export function jsonOnlyGroupKeys(group: Json): string[] {
    return otherKeys(group, GROUP_KEYS);
}
