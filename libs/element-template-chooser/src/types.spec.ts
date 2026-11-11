import { describe, expect, it } from "vitest";

import {
    applyTemplatePreset,
    classifyBinding,
    extractImplementationDetail,
    fallbackTranslate,
    partitionVisibleProperties,
    propertyDisplayLabel,
    templatePropertyDisplayText,
    templatePropertyValue,
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

describe("templatePropertyValue", () => {
    const choices = [
        { name: "Send mail", value: "send-mail" },
        { name: "Send SMS", value: "send-sms" },
    ];
    const taskTypeBinding = { type: "zeebe:taskDefinition", property: "type" };

    it.each<[string, Partial<TemplateProperty>, string | undefined]>([
        ["a required dropdown without a value", { type: "Dropdown", choices }, "send-mail"],
        ["a dropdown with a value", { type: "Dropdown", choices, value: "send-sms" }, "send-sms"],
        ["a dropdown with an empty value", { type: "Dropdown", choices, value: "" }, ""],
        ["an optional dropdown", { type: "Dropdown", choices, optional: true }, undefined],
        ["a dropdown without choices", { type: "Dropdown", choices: [] }, undefined],
        ["a string property", { type: "String", choices }, undefined],
        ["a string property with a value", { type: "String", value: "x" }, "x"],
    ])("gives %s the value the element is created with", (_label, overrides, value) => {
        expect(templatePropertyValue(property(taskTypeBinding, overrides))).toBe(value);
    });
});

describe("templatePropertyDisplayText", () => {
    const input = { type: "zeebe:input", name: "flag" };

    it.each<[string, Partial<TemplateProperty>, string | undefined]>([
        ["a string", { value: "GET" }, "GET"],
        ["a Boolean true", { type: "Boolean", value: true }, "true"],
        ["a Boolean false", { type: "Boolean", value: false }, "false"],
        ["a Number zero", { type: "Number", value: 0 }, "0"],
        ["a Number", { type: "Number", value: 5 }, "5"],
        [
            "a required dropdown without a value",
            { type: "Dropdown", choices: [{ name: "Send mail", value: "send-mail" }] },
            "send-mail",
        ],
        ["an empty string", { value: "" }, undefined],
        ["no value", {}, undefined],
    ])("shows %s as its text", (_label, overrides, text) => {
        expect(templatePropertyDisplayText(property(input, overrides))).toBe(text);
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

    it("takes the first choice of a required dropdown task type without a value", () => {
        const detail = extractImplementationDetail([
            property(
                { type: "zeebe:taskDefinition", property: "type" },
                {
                    type: "Dropdown",
                    choices: [
                        { name: "Send mail", value: "send-mail" },
                        { name: "Send SMS", value: "send-sms" },
                    ],
                },
            ),
        ]);

        expect(detail).toEqual({ label: "Task Type", value: "send-mail" });
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
