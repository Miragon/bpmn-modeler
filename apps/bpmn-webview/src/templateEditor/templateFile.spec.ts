import { describe, expect, it } from "vitest";

import { applyTemplateEdits } from "@miragon/bpmn-modeler-element-template-builder";

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
            choices: [{ position: 0, key: "mail@", label: "Mail task" }],
            selected: { position: 0, key: "mail@", label: "Mail task" },
            path: [],
        });
    });

    it("locates the selected template of an array file by its index in the file", () => {
        const text = JSON.stringify([42, MAIL, STATUS_V1]);

        expect(readTemplateFile(text, { position: 2, key: "status@1" })).toMatchObject({
            path: [2],
        });
        expect(readTemplateFile(text)).toMatchObject({ path: [1] });
    });

    it("offers every template of an array file, labelled with its version", () => {
        const state = readTemplateFile(JSON.stringify([MAIL, STATUS_V1, STATUS_V2]));

        expect(state.kind === "template" && state.choices).toEqual([
            { position: 0, key: "mail@", label: "Mail task" },
            { position: 1, key: "status@1", label: "Status (v1)" },
            { position: 2, key: "status@2", label: "Status (v2)" },
        ]);
    });

    it("selects the first template when none was selected before", () => {
        const text = JSON.stringify([MAIL, STATUS_V1, STATUS_V2]);

        expect(readTemplateFile(text)).toMatchObject({
            template: MAIL,
            selected: { position: 0, key: "mail@" },
        });
    });

    it.each([
        ["still there", { position: 2, key: "status@2" }, 2],
        ["moved in the file", { position: 0, key: "status@2" }, 2],
        ["renamed in place", { position: 1, key: "gone@3" }, 1],
        ["named by its place alone", { position: 1 }, 1],
        ["past the end of a file that shrank", { position: 9, key: "gone@3" }, 2],
    ])("stays on a template %s", (_, selection, position) => {
        const state = readTemplateFile(JSON.stringify([MAIL, STATUS_V1, STATUS_V2]), selection);

        expect(state).toMatchObject({ selected: { position }, path: [position] });
    });

    it("tells two templates with the same id and version apart by their place", () => {
        const second = { ...MAIL, name: "Second" };
        const text = JSON.stringify([MAIL, second]);

        expect(readTemplateFile(text, { position: 1, key: "mail@" })).toMatchObject({
            template: second,
        });
    });

    it("stays on a template while its id is typed", () => {
        let text = JSON.stringify([MAIL, STATUS_V1, STATUS_V2], null, 2);
        let state = readTemplateFile(text, { position: 2 });

        for (const id of ["s", "st", ""]) {
            const result = applyTemplateEdits(text, state.kind === "template" ? state.path : [], [
                id === ""
                    ? { kind: "remove", path: ["id"] }
                    : { kind: "set", path: ["id"], value: id },
            ]);
            text = result.kind === "applied" ? result.text : text;
            state = readTemplateFile(text, { position: 2 });
            expect(state.kind === "template" && state.template.name).toBe("Status");
        }

        expect(JSON.parse(text).slice(0, 2)).toEqual([MAIL, STATUS_V1]);
    });

    it("falls back to the file's engine when the selected template names none", () => {
        const plain = { id: "plain", name: "Plain" };

        expect(readTemplateFile(JSON.stringify([STATUS_V1, plain]), { position: 1 })).toMatchObject(
            {
                kind: "template",
                engine: "c8",
            },
        );
    });

    it("labels a template without a name by its id, or by its position", () => {
        const state = readTemplateFile(JSON.stringify([{ id: "anon" }, {}]));

        expect(state.kind === "unknownEngine" && state.choices).toEqual([
            { position: 0, key: "anon@", label: "anon" },
            { position: 1, key: "#1", label: "Template 2" },
        ]);
    });

    it("reports a template that names no engine with the choices still available", () => {
        expect(readTemplateFile(JSON.stringify({ id: "plain", name: "Plain" }))).toEqual({
            kind: "unknownEngine",
            choices: [{ position: 0, key: "plain@", label: "Plain" }],
            selected: { position: 0, key: "plain@", label: "Plain" },
            path: [],
        });
    });
});
