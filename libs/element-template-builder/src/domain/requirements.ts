import type { ElementTypeChoice, Requirement } from "../catalog";

type Json = Record<string, unknown>;

/** Whether the template holds what a binding needs elsewhere. */
export function meetsRequirement(template: Json, requirement: Requirement): boolean {
    if (requirement.kind === "binding") {
        return arrayOf(template.properties).some((property) => {
            const binding = objectOf(objectOf(property).binding);
            return Object.entries(requirement.binding).every(
                ([key, value]) => binding[key] === value,
            );
        });
    }
    const elementType = objectOf(template.elementType);
    return requirement.oneOf.some(
        (choice) =>
            elementType.value === choice.value &&
            (choice.eventDefinition === undefined ||
                elementType.eventDefinition === choice.eventDefinition),
    );
}

/** The way to meet an element type requirement that stays closest to what the template is for. */
export function elementTypeChoiceFor(
    template: Json,
    oneOf: readonly ElementTypeChoice[],
): ElementTypeChoice {
    const current = [objectOf(template.elementType).value, ...arrayOf(template.appliesTo)];
    return (
        current.flatMap((value) => oneOf.filter((choice) => choice.value === value))[0] ?? oneOf[0]
    );
}

function arrayOf(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function objectOf(value: unknown): Json {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Json)
        : {};
}
