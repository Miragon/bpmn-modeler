import { describe, expect, it } from "vitest";

import { validate, validateZeebe } from "@bpmn-io/element-templates-validator";
import { ELEMENT_TEMPLATE_SCHEMA_URL } from "@miragon/bpmn-modeler-types";

import { newTemplateText, templateIdentity, withSchema } from "./skeleton";

describe("templateIdentity", () => {
    it.each([
        ["send-mail.json", "send-mail", "Send Mail"],
        ["io.camunda.send-mail.json", "io.camunda.send-mail", "Send Mail"],
        ["sendMail.json", "sendMail", "Send Mail"],
        ["payment_check.JSON", "payment_check", "Payment Check"],
        [" Send  Mail .json", "Send-Mail", "Send Mail"],
        ["invoice", "invoice", "Invoice"],
        ["HTTPConnector.json", "HTTPConnector", "HTTPConnector"],
        ["io.json.reader.json", "io.json.reader", "Reader"],
        ["io.camunda..json", "io.camunda.", "io.camunda."],
        [".json", "new-element-template", "New Element Template"],
        ["Send\u00a0Mail.json", "Send-Mail", "Send Mail"],
        ["Send\u3000Mail.json", "Send-Mail", "Send Mail"],
        ["\ufeffmail.json", "mail", "Mail"],
        ["\u00dfmail.json", "\u00dfmail", "SSmail"],
    ])("names a template in %j", (fileName, id, name) => {
        expect(templateIdentity(fileName)).toEqual({ id, name });
    });
});

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
