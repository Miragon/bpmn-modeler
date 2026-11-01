import type { Engine } from "./engine";

export type ElementTemplate = Record<string, unknown>;

/** The schema each engine's templates reference in `$schema`. */
export const ELEMENT_TEMPLATE_SCHEMA_URL: Record<Engine, string> = {
    c7: "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json",
    c8: "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json",
};

const C8_SCHEMA_PACKAGE = "zeebe-element-templates-json-schema";
// Also a suffix of the C8 package name, so C8 must be checked first.
const C7_SCHEMA_PACKAGE = "element-templates-json-schema";

// `$schema` is conventionally the first key; scanning only the head keeps
// large data-URI icons out of a per-keystroke check.
const TEXT_HEAD_LENGTH = 4096;
const SCHEMA_PROPERTY = /"\$schema"\s*:\s*"[^"]*element-templates-json-schema[^"]*"/;
/** The folder below `<configFolder>` the template loader reads. */
export const ELEMENT_TEMPLATES_FOLDER = "element-templates";
const TEMPLATE_FOLDER = new RegExp(`[\\\\/]${ELEMENT_TEMPLATES_FOLDER}[\\\\/]`);

/** A template file holds either a single template or an array of them. */
export function templatesOfFile(parsedFile: unknown): ElementTemplate[] {
    return [parsedFile].flat() as ElementTemplate[];
}

/**
 * The engine a parsed template file targets, judged by its first template that
 * names one: `$schema` first, then engine-prefixed binding types, then the
 * `engines.camunda` range. `undefined` when nothing names an engine.
 */
export function detectTemplateEngine(parsedFile: unknown): Engine | undefined {
    for (const template of templatesOfFile(parsedFile)) {
        const engine = isRecord(template) ? engineOfTemplate(template) : undefined;
        if (engine) {
            return engine;
        }
    }
    return undefined;
}

/** Whether raw JSON text declares an element-template `$schema` near its start. */
export function isElementTemplateText(text: string): boolean {
    return SCHEMA_PROPERTY.test(text.slice(0, TEXT_HEAD_LENGTH));
}

/** A JSON file that names a template schema, or sits in an `element-templates` folder. */
export function isElementTemplateFile(path: string, text: string): boolean {
    return path.endsWith(".json") && (TEMPLATE_FOLDER.test(path) || isElementTemplateText(text));
}

function engineOfTemplate(template: Record<string, unknown>): Engine | undefined {
    return (
        engineOfSchema(template.$schema) ??
        engineOfBindings(template.properties) ??
        engineOfRange(template.engines)
    );
}

function engineOfSchema(schema: unknown): Engine | undefined {
    if (typeof schema !== "string") {
        return undefined;
    }
    if (schema.includes(C8_SCHEMA_PACKAGE)) {
        return "c8";
    }
    return schema.includes(C7_SCHEMA_PACKAGE) ? "c7" : undefined;
}

function engineOfBindings(properties: unknown): Engine | undefined {
    if (!Array.isArray(properties)) {
        return undefined;
    }
    for (const property of properties) {
        const type = isRecord(property) && isRecord(property.binding) && property.binding.type;
        if (typeof type !== "string") {
            continue;
        }
        // C8 nests zeebe bindings, e.g. `bpmn:Message#zeebe:subscription#property`.
        if (type.includes("zeebe:")) {
            return "c8";
        }
        if (type.startsWith("camunda:")) {
            return "c7";
        }
    }
    return undefined;
}

function engineOfRange(engines: unknown): Engine | undefined {
    const range = isRecord(engines) ? engines.camunda : undefined;
    const major = typeof range === "string" ? range.match(/\d+/)?.[0] : undefined;
    if (major === "7") {
        return "c7";
    }
    return major === "8" ? "c8" : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
