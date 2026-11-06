import { describe, expect, it } from "vitest";

import { catalogFor } from "./catalog";
import { elementTypeName } from "./elementTypes";

describe("elementTypeName", () => {
    it.each(["c7", "c8"] as const)("names every element type of the %s catalog", (engine) => {
        const unnamed = catalogFor(engine).elementTypes.filter(
            (type) => elementTypeName(type, (name) => name) === type,
        );

        expect(unnamed).toEqual([]);
    });

    it("translates the name", () => {
        expect(elementTypeName("bpmn:ServiceTask", (name) => `de:${name}`)).toBe("de:Service task");
    });

    it("keeps an identifier it does not know, untranslated", () => {
        expect(elementTypeName("bpmn:Bogus", (name) => `de:${name}`)).toBe("bpmn:Bogus");
    });
});
