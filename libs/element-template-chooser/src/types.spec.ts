import { describe, expect, it } from "vitest";

import {
    applyTemplatePreset,
    classifyBinding,
    extractImplementationDetail,
    fallbackTranslate,
    partitionVisibleProperties,
    propertyDisplayLabel,
} from "./types";
import type { BindingDirection, ElementTemplate, TemplateProperty } from "./types";

const template: ElementTemplate = {
    id: "rest",
    name: "REST",
    appliesTo: ["bpmn:ServiceTask"],
    properties: [
        { id: "method", type: "String", value: "GET", binding: { type: "zeebe:input" } },
        { id: "url", type: "String", binding: { type: "zeebe:input" } },
        {
            type: "Hidden",
            value: "io.camunda:http-json:1",
            binding: { type: "zeebe:taskDefinition" },
        },
    ],
    presets: [{ id: "post", properties: { method: "POST" } }],
};

function property(
    binding: TemplateProperty["binding"],
    overrides: Partial<TemplateProperty> = {},
): TemplateProperty {
    return { type: "String", binding, ...overrides };
}

describe("applyTemplatePreset", () => {
    it("overrides only the properties the preset names", () => {
        const applied = applyTemplatePreset(template, "post");

        expect(applied.properties.map((property) => property.value)).toEqual([
            "POST",
            undefined,
            "io.camunda:http-json:1",
        ]);
        expect(template.properties[0].value).toBe("GET");
    });

    it.each([
        ["no preset id", undefined],
        ["an unknown preset id", "missing"],
    ])("returns the template unchanged for %s", (_label, presetId) => {
        expect(applyTemplatePreset(template, presetId)).toBe(template);
    });
});

describe("classifyBinding", () => {
    it.each<[string, BindingDirection]>([
        ["camunda:out", "output"],
        ["camunda:outputParameter", "output"],
        ["zeebe:output", "output"],
        ["camunda:in", "input"],
        ["camunda:inputParameter", "input"],
        ["camunda:in:businessKey", "input"],
        ["zeebe:input", "input"],
        ["property", "property"],
        ["zeebe:property", "property"],
        ["zeebe:taskHeader", "property"],
        ["zeebe:taskDefinition", "hidden"],
        ["zeebe:taskDefinition:type", "hidden"],
        ["camunda:field", "hidden"],
        ["camunda:property", "hidden"],
        ["camunda:errorEventDefinition", "hidden"],
    ])("classifies a %s binding as %s", (type, direction) => {
        expect(classifyBinding({ type })).toBe(direction);
    });
});

describe("extractImplementationDetail", () => {
    it.each([
        ["camunda:topic", "Topic"],
        ["camunda:delegateExpression", "Delegate"],
        ["camunda:class", "Java class"],
        ["camunda:expression", "Expression"],
        ["calledElement", "Called element"],
    ])("labels a C7 %s property binding as %s", (name, label) => {
        const detail = extractImplementationDetail([
            property({ type: "property", name }, { value: "impl-value" }),
        ]);

        expect(detail).toEqual({ label, value: "impl-value" });
    });

    it("prefers the higher-priority binding regardless of property order", () => {
        const detail = extractImplementationDetail([
            property({ type: "property", name: "camunda:class" }, { value: "com.example.Worker" }),
            property({ type: "property", name: "camunda:topic" }, { value: "invoices" }),
        ]);

        expect(detail).toEqual({ label: "Topic", value: "invoices" });
    });

    it("skips an empty binding and falls through to the next one", () => {
        const detail = extractImplementationDetail([
            property({ type: "property", name: "camunda:topic" }, { value: "" }),
            property({ type: "property", name: "camunda:class" }, { value: "com.example.Worker" }),
        ]);

        expect(detail).toEqual({ label: "Java class", value: "com.example.Worker" });
    });

    it.each<[string, TemplateProperty["binding"]]>([
        ["shorthand", { type: "zeebe:taskDefinition:type" }],
        ["long-form", { type: "zeebe:taskDefinition", property: "type" }],
    ])("labels a C8 %s task definition as the task type", (_form, binding) => {
        const detail = extractImplementationDetail([
            property(binding, { type: "Hidden", value: "io.camunda:http-json:1" }),
        ]);

        expect(detail).toEqual({ label: "Task Type", value: "io.camunda:http-json:1" });
    });

    it("does not mistake another long-form task definition field for the task type", () => {
        const retries = property(
            { type: "zeebe:taskDefinition", property: "retries" },
            { type: "Hidden", value: "3" },
        );
        const taskType = (value: string) =>
            property({ type: "zeebe:taskDefinition", property: "type" }, { value });

        expect(extractImplementationDetail([retries, taskType("io.camunda:http-json:1")])).toEqual({
            label: "Task Type",
            value: "io.camunda:http-json:1",
        });
        expect(extractImplementationDetail([retries, taskType("")])).toBeUndefined();
    });

    it("returns undefined when no property names the implementation", () => {
        const detail = extractImplementationDetail([
            property({ type: "property", name: "camunda:asyncBefore" }, { value: "true" }),
            property({ type: "zeebe:input", name: "url" }, { value: "https://example.org" }),
        ]);

        expect(detail).toBeUndefined();
    });
});

describe("partitionVisibleProperties", () => {
    it("groups non-Hidden properties by binding direction and drops implementation bindings", () => {
        const header = property({ type: "zeebe:taskHeader", key: "retryBackoff" });
        const input = property({ type: "zeebe:input", name: "url" });
        const output = property({ type: "zeebe:output", source: "=response" });
        const hiddenInput = property({ type: "zeebe:input", name: "method" }, { type: "Hidden" });
        const taskType = property({ type: "zeebe:taskDefinition", property: "type" });

        expect(partitionVisibleProperties([taskType, output, hiddenInput, input, header])).toEqual({
            properties: [header],
            inputs: [input],
            outputs: [output],
        });
    });
});

describe("propertyDisplayLabel", () => {
    it.each<[string, TemplateProperty, string | undefined]>([
        [
            "the authored label",
            property({ type: "zeebe:input", name: "url" }, { label: "URL" }),
            "URL",
        ],
        ["the binding name", property({ type: "zeebe:input", name: "url" }), "url"],
        [
            "the binding key",
            property({ type: "zeebe:taskHeader", key: "retryBackoff" }),
            "retryBackoff",
        ],
        ["nothing", property({ type: "zeebe:output", source: "=response" }), undefined],
    ])("falls back to %s", (_source, templateProperty, label) => {
        expect(propertyDisplayLabel(templateProperty)).toBe(label);
    });
});

describe("fallbackTranslate", () => {
    it("resolves known placeholders and keeps unknown ones", () => {
        expect(fallbackTranslate("{count} of {total} properties", { count: "2" })).toBe(
            "2 of {total} properties",
        );
    });

    it("echoes a template without placeholders", () => {
        expect(fallbackTranslate("Apply Template")).toBe("Apply Template");
    });
});
