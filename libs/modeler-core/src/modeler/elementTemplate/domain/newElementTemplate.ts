import { ELEMENT_TEMPLATE_SCHEMA_URL, ENGINE_LABEL, Engine } from "@miragon/bpmn-modeler-types";

import { ChoicePrompt } from "../../../kernel/domain/prompts";

const FALLBACK_ID = "new-element-template";

export function elementTemplateEnginePrompt(): ChoicePrompt<Engine> {
    return {
        id: "elementTemplateEngine",
        placeholder: "Select the engine the element template is for.",
        items: [
            { label: ENGINE_LABEL.c7, value: "c7" },
            { label: ENGINE_LABEL.c8, value: "c8" },
        ],
    };
}

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
            .replace(/\s+/g, "-") || FALLBACK_ID;
    const words = id
        .slice(id.lastIndexOf(".") + 1)
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .split(/[-_\s]+/)
        .filter((word) => word !== "");
    const name = words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
    return { id, name: name || id };
}

/** A stub for a service task worker on either engine, formatted like a JSON editor saves it. */
export function newElementTemplate(engine: Engine, fileName: string): string {
    const { id, name } = templateIdentity(fileName);
    const header = { $schema: ELEMENT_TEMPLATE_SCHEMA_URL[engine], name, id, version: 1 };
    const template = engine === "c7" ? { ...header, ...c7Body(id) } : { ...header, ...c8Body(id) };
    return `${JSON.stringify(template, null, 2)}\n`;
}

function c7Body(topic: string) {
    return {
        appliesTo: ["bpmn:ServiceTask"],
        properties: [
            {
                type: "Hidden",
                value: "external",
                binding: { type: "property", name: "camunda:type" },
            },
            {
                type: "Hidden",
                value: topic,
                binding: { type: "property", name: "camunda:topic" },
            },
            {
                label: "Input",
                type: "String",
                binding: { type: "camunda:inputParameter", name: "input" },
                constraints: { notEmpty: true },
            },
        ],
    };
}

function c8Body(jobType: string) {
    return {
        appliesTo: ["bpmn:Task"],
        elementType: { value: "bpmn:ServiceTask" },
        groups: [{ id: "input", label: "Input" }],
        properties: [
            {
                type: "Hidden",
                value: jobType,
                binding: { type: "zeebe:taskDefinition", property: "type" },
            },
            {
                label: "Input",
                group: "input",
                type: "String",
                feel: "optional",
                binding: { type: "zeebe:input", name: "input" },
                constraints: { notEmpty: true },
            },
        ],
    };
}
