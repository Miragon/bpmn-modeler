import { describe, expect, it } from "vitest";

import { validateZeebe } from "@bpmn-io/element-templates-validator";
import { ELEMENT_TEMPLATE_SCHEMA_URL } from "@miragon/bpmn-modeler-types";

import { deprecationAdvice } from "./deprecations";
import { applyTemplateEdits } from "./templateText";

type Json = Record<string, unknown>;

const templateWith = (property: Json): Json => ({
    $schema: ELEMENT_TEMPLATE_SCHEMA_URL.c8,
    name: "T",
    id: "t",
    appliesTo: ["bpmn:ServiceTask"],
    properties: [property],
});

const input = { type: "String", label: "L", binding: { type: "zeebe:input", name: "a" } };

const warningsOf = (template: Json) =>
    (validateZeebe(template).warnings ?? []).map((warning) => warning.message);

describe("deprecationAdvice", () => {
    it.each<[string, Json]>([
        [
            "the old task definition binding",
            { ...input, binding: { type: "zeebe:taskDefinition:type" } },
        ],
        ["optional on an input", { ...input, optional: true }],
        ["FEEL on a field users cannot edit", { ...input, feel: "optional", editable: false }],
    ])("fixes %s so that the validator stops warning", (_, property) => {
        const template = templateWith(property);
        expect(warningsOf(template)).not.toEqual([]);

        const advice = deprecationAdvice(template, ["properties", 0]);
        const result = applyTemplateEdits(JSON.stringify(template), [], advice!.fix!.edits);

        expect(result.kind).toBe("applied");
        expect(warningsOf(JSON.parse(result.kind === "applied" ? result.text : "{}"))).toEqual([]);
    });

    it("explains a Hidden property without a value and leaves the value to the user", () => {
        const template = templateWith({ type: "Hidden", binding: input.binding });
        expect(warningsOf(template)).not.toEqual([]);

        expect(deprecationAdvice(template, ["properties", 0])).toEqual({
            message: "A Hidden property should have a value.",
        });
    });

    it.each([
        ["a property with nothing deprecated", ["properties", 0]],
        ["a property that is not there", ["properties", 3]],
        ["something else than a property", ["groups", 0]],
    ])("has nothing to say about %s", (_, path) => {
        expect(deprecationAdvice(templateWith(input), path)).toBeUndefined();
    });
});
