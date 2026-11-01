import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validate, validateZeebe } from "@bpmn-io/element-templates-validator";
import { detectTemplateEngine, Engine } from "@miragon/bpmn-modeler-types";
import { describe, expect, it } from "vitest";

import {
    elementTemplateEnginePrompt,
    newElementTemplate,
    templateIdentity,
} from "./newElementTemplate";

interface NewElementTemplateCases {
    identities: { fileName: string; id: string; name: string }[];
    templates: { engine: Engine; fileName: string; template: Record<string, unknown> }[];
}

// Shared with the IntelliJ host, whose copy of the stubs runs the same rows.
const CASES = JSON.parse(
    readFileSync(resolve(__dirname, "newElementTemplate.cases.json"), "utf8"),
) as NewElementTemplateCases;

const VALIDATORS = { c7: validate, c8: validateZeebe };

describe("templateIdentity", () => {
    it.each(CASES.identities)("names $fileName", ({ fileName, id, name }) => {
        expect(templateIdentity(fileName)).toEqual({ id, name });
    });
});

describe("newElementTemplate", () => {
    it.each(CASES.templates)("scaffolds a $engine template", ({ engine, fileName, template }) => {
        expect(JSON.parse(newElementTemplate(engine, fileName))).toEqual(template);
    });

    it.each<Engine>(["c7", "c8"])("passes the %s schema", (engine) => {
        const template = JSON.parse(newElementTemplate(engine, "send-mail.json"));

        expect(VALIDATORS[engine](template).errors).toBeNull();
    });

    it.each<Engine>(["c7", "c8"])("is told apart as a %s template", (engine) => {
        expect(detectTemplateEngine(JSON.parse(newElementTemplate(engine, "a.json")))).toBe(engine);
    });

    it("writes the file the way a JSON editor formats it", () => {
        const text = newElementTemplate("c8", "send-mail.json");

        expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
    });
});

describe("elementTemplateEnginePrompt", () => {
    it("offers both engines and nothing else", () => {
        expect(elementTemplateEnginePrompt().items.map((item) => [item.label, item.value])).toEqual(
            [
                ["Camunda 7", "c7"],
                ["Camunda 8", "c8"],
            ],
        );
    });
});
