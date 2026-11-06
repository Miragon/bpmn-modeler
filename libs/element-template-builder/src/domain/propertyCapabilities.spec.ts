import { describe, expect, it } from "vitest";

import { catalogFor } from "./catalog";
import { bindingSpecOf } from "./bindingRules";
import { propertyCapabilities, typeCapabilities } from "./propertyCapabilities";

const C8 = catalogFor("c8");

describe("typeCapabilities", () => {
    it.each([
        ["String", { textual: true, feel: true, language: false, visible: true, requirable: true }],
        ["Text", { textual: true, feel: true, language: true, visible: true, requirable: true }],
        [
            "Number",
            { textual: false, feel: true, language: false, visible: true, requirable: true },
        ],
        [
            "Boolean",
            { textual: false, feel: true, language: false, visible: true, requirable: false },
        ],
        [
            "Dropdown",
            { textual: false, feel: false, language: false, visible: true, requirable: true },
        ],
        [
            "Hidden",
            { textual: false, feel: false, language: false, visible: false, requirable: false },
        ],
        [
            "Bogus",
            { textual: false, feel: false, language: false, visible: true, requirable: true },
        ],
        [
            undefined,
            { textual: false, feel: false, language: false, visible: true, requirable: true },
        ],
    ])("knows what a %s field can carry", (type, expected) => {
        expect(typeCapabilities(type)).toEqual(expected);
    });
});

describe("propertyCapabilities", () => {
    const of = (type: string, binding: Record<string, unknown>) =>
        propertyCapabilities({ type, binding }, bindingSpecOf(C8, binding.type));

    it.each([
        ["a String input", "String", { type: "zeebe:input", name: "a" }, "optional", true],
        ["a Dropdown input", "Dropdown", { type: "zeebe:input", name: "a" }, "none", true],
        ["a String BPMN attribute", "String", { type: "property", name: "a" }, "optional", false],
        [
            "a Boolean flag of a called process",
            "Boolean",
            { type: "zeebe:calledElement", property: "propagateAllChildVariables" },
            "none",
            false,
        ],
        [
            "a script's expression",
            "String",
            { type: "zeebe:script", property: "expression" },
            "required",
            false,
        ],
        ["a binding the catalog does not know", "String", { type: "zeebe:new" }, "none", false],
    ])("reads FEEL and optional for %s", (_, type, binding, feelUse, optional) => {
        expect(of(type, binding)).toMatchObject({ feelUse, optional });
    });

    it("allows no FEEL on a property without a binding", () => {
        const spec = bindingSpecOf(C8, "zeebe:input");

        expect(propertyCapabilities({ type: "String" }, spec).feelUse).toBe("none");
    });
});
