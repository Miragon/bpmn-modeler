import { arrayOf, objectOf, type Json } from "./json";
import type { JsonPath, TemplateEdit } from "./templateText";

export interface DeprecationAdvice {
    message: string;
    fix?: { label: string; edits: TemplateEdit[] };
}

/**
 * What to say and do about a deprecated property, which the validator only
 * reports in raw English ("Value is deprecated"). Read from the property, since
 * those texts are the schema's to change.
 */
export function deprecationAdvice(template: Json, path: JsonPath): DeprecationAdvice | undefined {
    const [list, index] = path;
    if (list !== "properties" || typeof index !== "number") {
        return undefined;
    }
    const property = objectOf(arrayOf(template.properties)[index]);
    const binding = objectOf(property.binding);
    const at = (...rest: JsonPath): JsonPath => ["properties", index, ...rest];

    if (binding.type === "zeebe:taskDefinition:type") {
        return {
            message:
                "This binding is deprecated; a task definition with the attribute type replaces it.",
            fix: {
                label: "Use the task definition",
                edits: [
                    { kind: "set", path: at("binding", "type"), value: "zeebe:taskDefinition" },
                    { kind: "set", path: at("binding", "property"), value: "type" },
                ],
            },
        };
    }
    if (property.optional === true && binding.type === "zeebe:input") {
        return {
            message:
                "Optional on an input mapping is deprecated; from Camunda 8.8 an empty input mapping is null.",
            fix: { label: "Remove Optional", edits: [{ kind: "remove", path: at("optional") }] },
        };
    }
    if (property.feel === "optional" && property.editable === false) {
        return {
            message: "Users cannot enter FEEL into a field they cannot edit.",
            fix: { label: "Remove FEEL", edits: [{ kind: "remove", path: at("feel") }] },
        };
    }
    if (property.type === "Hidden" && property.value === undefined) {
        return { message: "A Hidden property should have a value." };
    }
    return undefined;
}
