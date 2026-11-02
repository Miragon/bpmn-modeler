import { describe, expect, it } from "vitest";

import { validate, validateZeebe } from "@bpmn-io/element-templates-validator";
import { ELEMENT_TEMPLATE_SCHEMA_URL } from "@miragon/bpmn-modeler-types";

import { newTemplateText, withSchema } from "./skeleton";

describe("newTemplateText", () => {
    it.each([
        ["c7", validate],
        ["c8", validateZeebe],
    ] as const)("writes a valid %s template", (engine, check) => {
        const text = newTemplateText(engine, {
            name: "Send Mail",
            elementType: "bpmn:SendTask",
            fileName: "send-mail.json",
        });

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

describe("the id of a new template", () => {
    const idOf = (name: string, fileName?: string) =>
        JSON.parse(newTemplateText("c8", { name, elementType: "bpmn:Task", fileName })).id;

    it("comes from its file, whatever name the start form got", () => {
        expect(idOf("Anything else", "send-mail.json")).toBe("send-mail");
    });

    it("comes from the name of a template that has no file name yet", () => {
        expect(idOf("Send Mail")).toBe("Send-Mail");
    });
});

describe("withSchema", () => {
    it("adds the engine's schema at the top of the selected template", () => {
        const text = '[\n  { "name": "A", "id": "a" },\n  { "name": "B", "id": "b" }\n]\n';

        const result = withSchema(text, [1], "c8");
        const templates = result.kind === "applied" ? JSON.parse(result.text) : [];

        expect(templates[1]).toEqual({
            $schema: ELEMENT_TEMPLATE_SCHEMA_URL.c8,
            name: "B",
            id: "b",
        });
        expect(templates[0]).toEqual({ name: "A", id: "a" });
    });
});
