const SUPPORTED_COMPONENTS = new Set([
    "textfield",
    "textarea",
    "number",
    "checkbox",
    "checklist",
    "radio",
    "select",
    "taglist",
    "datetime",
    "text",
    "html",
    "image",
    "button",
    "group",
    "dynamiclist",
    "table",
    "spacer",
    "separator",
    "expression",
]);

export function parsePreviewSchema(content: string): Record<string, unknown> {
    let schema: unknown;
    try {
        schema = JSON.parse(content);
    } catch {
        throw new Error("The saved form is not valid JSON.");
    }
    if (
        !schema ||
        typeof schema !== "object" ||
        !Array.isArray((schema as Record<string, unknown>).components)
    ) {
        throw new Error("The saved form must contain a components array.");
    }
    function check(components: unknown[]): void {
        for (const component of components) {
            if (!component || typeof component !== "object") {
                throw new Error("The form contains an invalid component.");
            }
            const field = component as Record<string, unknown>;
            if (typeof field.type !== "string" || !SUPPORTED_COMPONENTS.has(field.type)) {
                throw new Error(
                    "This form contains a component that is not supported in the preview. Open it in the form editor instead.",
                );
            }
            if (field.components !== undefined) {
                if (!Array.isArray(field.components))
                    throw new Error("The form contains invalid nested components.");
                check(field.components);
            }
        }
    }
    check((schema as { components: unknown[] }).components);
    return schema as Record<string, unknown>;
}
