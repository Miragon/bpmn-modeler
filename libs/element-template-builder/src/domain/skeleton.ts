import { ELEMENT_TEMPLATE_SCHEMA_URL, type Engine } from "@miragon/bpmn-modeler-types";

import { applyTemplateEdits, type JsonPath } from "./templateText";

/** A template id from its name: lower-case words joined by dashes. */
export function templateIdOf(name: string): string {
    return (
        name
            .toLowerCase()
            .match(/[a-z0-9]+/g)
            ?.join("-") ?? "template"
    );
}

/** The text of a new, valid template without properties. */
export function newTemplateText(
    engine: Engine,
    { name, elementType }: { name: string; elementType: string },
): string {
    const template = {
        $schema: ELEMENT_TEMPLATE_SCHEMA_URL[engine],
        name,
        id: templateIdOf(name),
        version: 1,
        appliesTo: [elementType],
        properties: [],
    };
    return `${JSON.stringify(template, null, 2)}\n`;
}

/** Names the engine of the template at `templatePath` through its `$schema`. */
export function withSchema(text: string, templatePath: JsonPath, engine: Engine): string {
    return applyTemplateEdits(text, templatePath, [
        { kind: "set", path: ["$schema"], value: ELEMENT_TEMPLATE_SCHEMA_URL[engine] },
    ]);
}
