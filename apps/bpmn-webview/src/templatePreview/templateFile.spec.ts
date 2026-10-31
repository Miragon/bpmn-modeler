import { describe, expect, it } from "vitest";

import { readTemplateFile } from "./templateFile";

const C7_SCHEMA = "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json";
const C8_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";

const MAIL = { $schema: C7_SCHEMA, id: "mail", name: "Mail task" };
const STATUS_V1 = { $schema: C8_SCHEMA, id: "status", name: "Status", version: 1 };
const STATUS_V2 = { $schema: C8_SCHEMA, id: "status", name: "Status", version: 2 };

describe("readTemplateFile", () => {
    it.each([
        ["an empty file", ""],
        ["whitespace", "  \n\t"],
    ])("reports %s as empty", (_, text) => {
        expect(readTemplateFile(text)).toEqual({ kind: "empty" });
    });

    it("reports unparseable JSON with the parser's message", () => {
        const state = readTemplateFile('{ "name": ');

        expect(state.kind).toBe("invalidJson");
        expect(state.kind === "invalidJson" && state.message).not.toBe("");
    });

    it.each([
        ["a string", '"text"'],
        ["a number", "42"],
        ["null", "null"],
        ["an empty array", "[]"],
        ["an array without objects", "[1, null]"],
    ])("reports %s as not a template", (_, text) => {
        expect(readTemplateFile(text)).toEqual({ kind: "notATemplate" });
    });

    it("reads a single template with its engine", () => {
        expect(readTemplateFile(JSON.stringify(MAIL))).toEqual({
            kind: "template",
            template: MAIL,
            engine: "c7",
            choices: [{ key: "mail@", label: "Mail task" }],
            selected: "mail@",
        });
    });

    it("offers every template of an array file, labelled with its version", () => {
        const state = readTemplateFile(JSON.stringify([MAIL, STATUS_V1, STATUS_V2]));

        expect(state.kind === "template" && state.choices).toEqual([
            { key: "mail@", label: "Mail task" },
            { key: "status@1", label: "Status (v1)" },
            { key: "status@2", label: "Status (v2)" },
        ]);
    });

    it("selects the first template unless a known one was selected before", () => {
        const text = JSON.stringify([MAIL, STATUS_V1, STATUS_V2]);

        expect(readTemplateFile(text)).toMatchObject({ template: MAIL, selected: "mail@" });
        expect(readTemplateFile(text, "status@2")).toMatchObject({
            template: STATUS_V2,
            engine: "c8",
            selected: "status@2",
        });
        expect(readTemplateFile(text, "gone@3")).toMatchObject({ selected: "mail@" });
    });

    it("falls back to the file's engine when the selected template names none", () => {
        const plain = { id: "plain", name: "Plain" };

        expect(readTemplateFile(JSON.stringify([STATUS_V1, plain]), "plain@")).toMatchObject({
            kind: "template",
            engine: "c8",
        });
    });

    it("labels a template without a name by its id, or by its position", () => {
        const state = readTemplateFile(JSON.stringify([{ id: "anon" }, {}]));

        expect(state.kind === "unknownEngine" && state.choices).toEqual([
            { key: "anon@", label: "anon" },
            { key: "#1", label: "Template 2" },
        ]);
    });

    it("reports a template that names no engine with the choices still available", () => {
        expect(readTemplateFile(JSON.stringify({ id: "plain", name: "Plain" }))).toEqual({
            kind: "unknownEngine",
            choices: [{ key: "plain@", label: "Plain" }],
            selected: "plain@",
        });
    });
});
