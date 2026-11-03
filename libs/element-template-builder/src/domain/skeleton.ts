import { ELEMENT_TEMPLATE_SCHEMA_URL, type Engine } from "@miragon/bpmn-modeler-types";

import { applyTemplateEdits, type JsonPath, type TemplateEditResult } from "./templateText";

const FALLBACK_TEMPLATE_ID = "new-element-template";

/**
 * A template's `id` and `name` derived from the file it is saved in, so two new
 * templates do not collide on the default `id`. The name drops a reverse-domain
 * prefix and splits kebab, snake and camel case into words.
 */
export function templateIdentity(fileName: string): { id: string; name: string } {
    const id =
        fileName
            .replace(/\.json$/i, "")
            .trim()
            .replace(/\s+/g, "-") || FALLBACK_TEMPLATE_ID;
    const words = id
        .slice(id.lastIndexOf(".") + 1)
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .split(/[-_\s]+/)
        .filter((word) => word !== "");
    const name = words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
    return { id, name: name || id };
}

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
