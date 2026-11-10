import { normalizeNumericValidation } from "../../domain/numericValidation";

interface EditEvent {
    context: { properties: Record<string, unknown> };
}

interface EventBus {
    on(event: string, handler: (event: EditEvent) => void): void;
}

class NumericValidationEditing {
    static $inject = ["eventBus"];

    constructor(eventBus: EventBus) {
        eventBus.on("commandStack.formField.edit.preExecute", ({ context }) => {
            if (Object.hasOwn(context.properties, "validate")) {
                context.properties = {
                    ...context.properties,
                    validate: normalizeNumericValidation(context.properties.validate),
                };
            }
        });
    }
}

export const numericValidationModule = {
    __init__: ["numericValidationEditing"],
    numericValidationEditing: ["type", NumericValidationEditing],
};
