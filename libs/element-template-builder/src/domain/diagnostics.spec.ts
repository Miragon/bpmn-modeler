import { describe, expect, it } from "vitest";

import { catalogFor } from "../catalog";
import { ruleDiagnostics, schemaDiagnostics } from "./diagnostics";

type Json = Record<string, unknown>;

const C7_SCHEMA = "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json";
const C8_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";

const C8 = catalogFor("c8");

function c8Template(properties: Json[], extra: Json = {}): Json {
    return {
        $schema: C8_SCHEMA,
        name: "T",
        id: "t",
        appliesTo: ["bpmn:ServiceTask"],
        ...extra,
        properties,
    };
}

const input = (extra: Json = {}): Json => ({
    label: "In",
    type: "String",
    binding: { type: "zeebe:input", name: "in" },
    ...extra,
});

describe("schemaDiagnostics", () => {
    it("finds nothing wrong with a valid template", () => {
        expect(schemaDiagnostics("c8", c8Template([input()]))).toEqual([]);
    });

    it("reports the validator's message at the field it concerns, without the noise around it", () => {
        expect(schemaDiagnostics("c8", c8Template([input({ type: "Bogus" })]))).toEqual([
            {
                path: ["properties", 0, "type"],
                severity: "error",
                message:
                    'invalid property type "Bogus" for binding type "zeebe:input"; must be any of { String, Text, Hidden, Dropdown, Boolean, Number }',
                verbatim: true,
            },
        ]);
    });

    it("points a missing key at where it belongs", () => {
        const template = c8Template([input({ binding: { type: "zeebe:input" } })]);

        expect(schemaDiagnostics("c8", template)).toContainEqual(
            expect.objectContaining({
                path: ["properties", 0, "binding", "name"],
                severity: "error",
            }),
        );
    });

    it("validates C7 templates against the C7 schema", () => {
        const template = {
            $schema: C7_SCHEMA,
            name: "T",
            id: "t",
            appliesTo: ["bpmn:ServiceTask"],
            properties: [
                {
                    label: "In",
                    type: "Number",
                    binding: { type: "camunda:inputParameter", name: "in" },
                },
            ],
        };

        expect(schemaDiagnostics("c7", template).map((d) => d.path)).toContainEqual([
            "properties",
            0,
            "type",
        ]);
    });
});

describe("ruleDiagnostics", () => {
    it("finds nothing wrong with a well-formed template", () => {
        const template = c8Template(
            [
                input({ id: "in", group: "g" }),
                input({ condition: { property: "in", equals: "x" } }),
            ],
            {
                groups: [{ id: "g", label: "G" }],
            },
        );

        expect(ruleDiagnostics(template, C8)).toEqual([]);
    });

    it.each([
        [
            "a duplicate property id",
            c8Template([input({ id: "a" }), input({ id: "a" })]),
            ["properties", 1, "id"],
            'Another property already has the id "{id}".',
            { id: "a" },
        ],
        [
            "a condition on a missing property",
            c8Template([input({ condition: { property: "nope", equals: "x" } })]),
            ["properties", 0, "condition", "property"],
            'No property has the id "{id}".',
            { id: "nope" },
        ],
        [
            "a condition on the property itself",
            c8Template([input({ id: "self", condition: { property: "self", equals: "x" } })]),
            ["properties", 0, "condition", "property"],
            "A property cannot depend on itself.",
            undefined,
        ],
        [
            "a group that does not exist",
            c8Template([input({ group: "missing" })]),
            ["properties", 0, "group"],
            'No group has the id "{id}"; the property shows under "Custom properties".',
            { id: "missing" },
        ],
        [
            "a Dropdown value that is not a choice",
            c8Template([
                input({ type: "Dropdown", value: "c", choices: [{ name: "A", value: "a" }] }),
            ]),
            ["properties", 0, "value"],
            "The value must be one of the choices.",
            undefined,
        ],
        [
            "a form with both a form id and a reference",
            c8Template(
                [
                    { type: "Hidden", value: "", binding: { type: "zeebe:userTask" } },
                    input({
                        type: "Hidden",
                        value: "f",
                        binding: { type: "zeebe:formDefinition", property: "formId" },
                    }),
                    input({
                        type: "Hidden",
                        value: "r",
                        binding: { type: "zeebe:formDefinition", property: "externalReference" },
                    }),
                ],
                { appliesTo: ["bpmn:UserTask"], elementType: { value: "bpmn:UserTask" } },
            ),
            ["properties", 2, "binding", "property"],
            "A form is either a form id or an external reference, not both.",
            undefined,
        ],
    ])("reports %s", (_, template, path, message, replacements) => {
        const diagnostic = ruleDiagnostics(template, C8).find(
            (candidate) => candidate.message === message,
        );

        expect(diagnostic).toMatchObject({ path });
        expect(diagnostic?.replacements).toEqual(replacements);
    });

    it("offers a fix for a binding's missing requirement", () => {
        const template = c8Template([
            input({
                type: "Hidden",
                value: "f",
                binding: { type: "zeebe:formDefinition", property: "formId" },
            }),
        ]);

        const diagnostics = ruleDiagnostics(template, C8);

        expect(diagnostics).toEqual([
            expect.objectContaining({
                path: ["properties", 0, "binding", "type"],
                message: "This binding needs the element type {type}.",
                replacements: { type: "bpmn:UserTask" },
                fix: {
                    label: "Set the element type",
                    requirement: expect.objectContaining({ kind: "elementType" }),
                },
            }),
            expect.objectContaining({
                message: "This binding needs a zeebe:userTask property.",
                fix: { label: "Add it", requirement: expect.objectContaining({ kind: "binding" }) },
            }),
        ]);
    });

    it("names every element type a binding accepts, with their event definitions", () => {
        const template = c8Template([
            input({
                type: "Hidden",
                value: "m",
                binding: { type: "bpmn:Message#property", name: "name" },
            }),
        ]);

        expect(ruleDiagnostics(template, C8)).toEqual([
            expect.objectContaining({
                message: "This binding needs one of the element types {types}.",
                replacements: {
                    types: expect.stringContaining(
                        "bpmn:IntermediateThrowEvent (bpmn:MessageEventDefinition), ",
                    ),
                },
            }),
        ]);
    });

    it("accepts an element type with the event definition the binding needs", () => {
        const template = c8Template(
            [
                input({
                    type: "Hidden",
                    value: "m",
                    binding: { type: "bpmn:Message#property", name: "name" },
                }),
            ],
            {
                appliesTo: ["bpmn:IntermediateThrowEvent"],
                elementType: {
                    value: "bpmn:IntermediateThrowEvent",
                    eventDefinition: "bpmn:MessageEventDefinition",
                },
            },
        );

        expect(ruleDiagnostics(template, C8)).toEqual([]);
    });

    it("tells that a binding the builder does not edit stays in JSON", () => {
        const template = c8Template([
            input({ binding: { type: "zeebe:linkedResource", linkName: "x" } }),
        ]);

        expect(ruleDiagnostics(template, C8)).toEqual([
            {
                path: ["properties", 0, "binding", "type"],
                severity: "info",
                message: "The builder does not edit {binding} bindings yet; edit this one in JSON.",
                replacements: { binding: "zeebe:linkedResource" },
            },
        ]);
    });
});
