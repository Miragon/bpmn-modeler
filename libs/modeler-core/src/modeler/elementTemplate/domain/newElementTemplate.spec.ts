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
    enginePrompt: { placeholder: string; items: { label: string; value: Engine }[] };
    templates: { engine: Engine; fileName: string; text: string }[];
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
    it.each(CASES.templates)("writes $fileName for $engine", ({ engine, fileName, text }) => {
        expect(newElementTemplate(engine, fileName)).toBe(text);
    });

    it.each<Engine>(["c7", "c8"])("passes the %s schema", (engine) => {
        const template = JSON.parse(newElementTemplate(engine, "send-mail.json"));

        expect(VALIDATORS[engine](template).errors).toBeNull();
    });

    it.each<Engine>(["c7", "c8"])("is told apart as a %s template", (engine) => {
        expect(detectTemplateEngine(JSON.parse(newElementTemplate(engine, "a.json")))).toBe(engine);
    });
});

describe("elementTemplateEnginePrompt", () => {
    it("offers both engines and nothing else", () => {
        expect(elementTemplateEnginePrompt()).toEqual({
            id: "elementTemplateEngine",
            ...CASES.enginePrompt,
        });
    });
});
