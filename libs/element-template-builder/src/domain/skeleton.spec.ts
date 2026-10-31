import { describe, expect, it } from "vitest";

import { validate, validateZeebe } from "@bpmn-io/element-templates-validator";
import { ELEMENT_TEMPLATE_SCHEMA_URL } from "@miragon/bpmn-modeler-types";

import { newTemplateText, templateIdOf, withSchema } from "./skeleton";

describe("templateIdOf", () => {
    it.each([
        ["Send Mail", "send-mail"],
        ["  Kunden-Status ändern!  ", "kunden-status-ndern"],
        ["Payment.v2", "payment-v2"],
        ["***", "template"],
    ])("derives an id from %j", (name, id) => {
        expect(templateIdOf(name)).toBe(id);
    });
});

describe("newTemplateText", () => {
    it.each([
        ["c7", validate],
        ["c8", validateZeebe],
    ] as const)("writes a valid %s template", (engine, check) => {
        const text = newTemplateText(engine, { name: "Send Mail", elementType: "bpmn:SendTask" });

        expect(JSON.parse(text)).toEqual({
            $schema: ELEMENT_TEMPLATE_SCHEMA_URL[engine],
            name: "Send Mail",
            id: "send-mail",
            version: 1,
            appliesTo: ["bpmn:SendTask"],
            properties: [],
        });
        expect(check(text).valid).toBe(true);
        expect(text.endsWith("}\n")).toBe(true);
    });
});

describe("withSchema", () => {
    it("adds the engine's schema at the top of the selected template", () => {
        const text = '[\n  { "name": "A", "id": "a" },\n  { "name": "B", "id": "b" }\n]\n';

        const result = withSchema(text, [1], "c8");

        expect(JSON.parse(result)[1]).toEqual({
            $schema: ELEMENT_TEMPLATE_SCHEMA_URL.c8,
            name: "B",
            id: "b",
        });
        expect(JSON.parse(result)[0]).toEqual({ name: "A", id: "a" });
    });
});
