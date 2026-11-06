import { describe, expect, it } from "vitest";

import { catalogFor } from "./catalog";
import { bindingFits, bindingOptions } from "./bindingOptions";
import { bindingSpecOf } from "./bindingRules";

const C7 = catalogFor("c7");
const C8 = catalogFor("c8");

const typesOf = (specs: readonly { type: string }[]) => specs.map(({ type }) => type);

describe("the bindings offered for a template", () => {
    it("offers a call activity's in and out mappings first, and field injection only as another element's", () => {
        const { fitting, otherElements } = bindingOptions(C7, {
            appliesTo: ["bpmn:CallActivity"],
        });

        expect(typesOf(fitting)).toEqual(
            expect.arrayContaining(["camunda:in", "camunda:out", "camunda:in:businessKey"]),
        );
        expect(typesOf(otherElements)).toEqual(["camunda:field"]);
    });

    it("keeps the call activity's mappings out of a service task's", () => {
        const { fitting, otherElements } = bindingOptions(C7, {
            appliesTo: ["bpmn:ServiceTask"],
        });

        expect(typesOf(fitting)).toContain("camunda:field");
        expect(typesOf(otherElements)).toEqual([
            "camunda:in",
            "camunda:out",
            "camunda:in:businessKey",
        ]);
    });

    it("reads what a C8 binding needs from its requirement", () => {
        const { fitting, otherElements } = bindingOptions(C8, { appliesTo: ["bpmn:Task"] });

        expect(typesOf(otherElements)).toContain("zeebe:calledElement");
        expect(typesOf(fitting)).toContain("zeebe:input");
    });

    it("counts the element type a template creates", () => {
        const spec = bindingSpecOf(C8, "zeebe:calledElement")!;

        expect(
            bindingFits(spec, {
                appliesTo: ["bpmn:Task"],
                elementType: { value: "bpmn:CallActivity" },
            }),
        ).toBe(true);
    });

    it("fits everything while the template names no element", () => {
        const { otherElements } = bindingOptions(C7, {});

        expect(otherElements).toEqual([]);
    });

    it.each([
        ["c7", C7],
        ["c8", C8],
    ] as const)("names what the %s schema knows and the builder does not edit", (_, catalog) => {
        expect(bindingOptions(catalog, {}).jsonOnly).toEqual(catalog.jsonOnlyBindings);
    });
});
