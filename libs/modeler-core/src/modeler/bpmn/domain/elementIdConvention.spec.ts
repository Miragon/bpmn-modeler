import { describe, expect, it } from "vitest";

import { elementIdConventionOptionsOf } from "./elementIdConvention";

describe("elementIdConventionOptionsOf", () => {
    it.each<[string, unknown]>([
        ["no setting", undefined],
        ["a flag", "warn"],
        ["a numeric flag", 2],
        ["a flag without options", ["error"]],
        ["options that are not an object", ["error", "snake_case"]],
        ["null options", ["error", null]],
    ])("falls back to the rule's defaults for %s", (_, setting) => {
        expect(elementIdConventionOptionsOf(setting)).toEqual({});
    });

    it("takes the case, the prefixes and the qualifier mode", () => {
        expect(
            elementIdConventionOptionsOf([
                "error",
                {
                    case: "snake_case",
                    prefixes: { "bpmn:SequenceFlow": "Flow_", "bpmn:ScriptTask": false },
                    eventDefinitionQualifier: "required",
                },
            ]),
        ).toEqual({
            case: "snake_case",
            prefixes: { "bpmn:SequenceFlow": "Flow_", "bpmn:ScriptTask": false },
            eventDefinitionQualifier: "required",
        });
    });

    it("keeps the options of a rule switched off, since they still name the convention", () => {
        expect(elementIdConventionOptionsOf(["off", { case: "PascalCase" }])).toEqual({
            case: "PascalCase",
        });
    });

    it("drops values the rule could not use, so its defaults fill in", () => {
        expect(
            elementIdConventionOptionsOf([
                "warn",
                {
                    case: 3,
                    prefixes: { "bpmn:Task": 5 },
                    eventDefinitionQualifier: "sometimes",
                    unknown: true,
                },
            ]),
        ).toEqual({});
    });
});
