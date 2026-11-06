import type { EngineCatalog } from "./catalog";
import { bindingSpecOf } from "./bindingRules";
import { arrayOf, objectOf, stringOf, type Json } from "./json";
import type { JsonPath } from "./templateText";
import type { Translate } from "./translate";

const BINDING_TARGET_KEYS = ["name", "key", "property", "target", "source"];

/** The binding fields a search looks through, besides its type. */
export function bindingTargets(binding: Json): unknown[] {
    return BINDING_TARGET_KEYS.map((key) => binding[key]);
}

/** What a property without a label or id does, in words: `Task definition (type)`. */
function bindingTitle(binding: Json, catalog: EngineCatalog, translate: Translate): string {
    const spec = bindingSpecOf(catalog, binding.type);
    if (!spec) {
        const label = catalog.jsonOnlyBindingLabels?.[stringOf(binding.type)];
        return label ? translate(label) : stringOf(binding.type);
    }
    const target = bindingTargets(binding).map(stringOf).find(Boolean);
    return target ? `${translate(spec.label)} (${target})` : translate(spec.label);
}

/** A property's title in lists: its label, its id, or else what it binds to. */
export function propertyTitle(
    property: Json,
    catalog: EngineCatalog,
    translate: Translate,
): string {
    return (
        stringOf(property.label) ||
        stringOf(property.id) ||
        bindingTitle(objectOf(property.binding), catalog, translate) ||
        translate("Unlabeled property")
    );
}

export function groupTitle(group: Json, translate: Translate): string {
    return stringOf(group.label) || stringOf(group.id) || translate("Unnamed group");
}

/** The property or group a problem is about; template-wide problems need no name. */
export function problemPlace(
    path: JsonPath,
    template: Json,
    catalog: EngineCatalog,
    translate: Translate,
): string | undefined {
    const [list, index] = path;
    if (typeof index !== "number") {
        return undefined;
    }
    if (list === "properties") {
        return propertyTitle(objectOf(arrayOf(template.properties)[index]), catalog, translate);
    }
    return list === "groups"
        ? groupTitle(objectOf(arrayOf(template.groups)[index]), translate)
        : undefined;
}
