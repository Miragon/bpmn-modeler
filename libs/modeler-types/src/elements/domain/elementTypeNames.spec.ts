import { describe, expect, it } from "vitest";

import { elementTypeName } from "./elementTypeNames";

describe("elementTypeName", () => {
    it("translates the name", () => {
        expect(elementTypeName("bpmn:ServiceTask", (name) => `de:${name}`)).toBe("de:Service task");
    });

    it("keeps an identifier it does not know, untranslated", () => {
        expect(elementTypeName("bpmn:Bogus", (name) => `de:${name}`)).toBe("bpmn:Bogus");
    });
});
