import { withStringBounds } from "../../domain/numericValidation";

interface EditEvent {
    context: { properties: Record<string, unknown> };
}

interface EventBus {
    on(event: string, handler: (event: EditEvent) => void): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

class NumericValidationEditing {
    static $inject = ["eventBus"];

    constructor(eventBus: EventBus) {
        eventBus.on("commandStack.formField.edit.preExecute", ({ context }) => {
            const validation = context.properties.validate;
            if (Object.hasOwn(context.properties, "validate") && isRecord(validation)) {
                context.properties = {
                    ...context.properties,
                    validate: withStringBounds(validation),
                };
            }
        });
    }
}

export const numericValidationModule = {
    __init__: ["numericValidationEditing"],
    numericValidationEditing: ["type", NumericValidationEditing],
};
