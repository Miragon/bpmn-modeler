import {
    ELEMENT_TEMPLATE_SCHEMA_URL,
    type Engine,
    templateIdentity,
} from "@miragon/bpmn-modeler-types";

import { applyTemplateEdits, type JsonPath, type TemplateEditResult } from "./templateText";

/**
 * The text of a new, valid template without properties. Its id comes from the
 * file it is in, so two new templates do not collide on a name they share.
 */
export function newTemplateText(
    engine: Engine,
    {
        name,
        elementType,
        fileName = name,
    }: { name: string; elementType: string; fileName?: string },
): string {
    const template = {
        $schema: ELEMENT_TEMPLATE_SCHEMA_URL[engine],
        name,
        id: templateIdentity(fileName).id,
        version: 1,
        appliesTo: [elementType],
        properties: [],
    };
    return `${JSON.stringify(template, null, 2)}\n`;
}

/** Names the engine of the template at `templatePath` through its `$schema`. */
export function withSchema(
    text: string,
    templatePath: JsonPath,
    engine: Engine,
): TemplateEditResult {
    return applyTemplateEdits(text, templatePath, [
        { kind: "set", path: ["$schema"], value: ELEMENT_TEMPLATE_SCHEMA_URL[engine] },
    ]);
}
