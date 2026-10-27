import { describe, expect, it } from "vitest";

import { escapeRegExpLiteral } from "@miragon/bpmn-modeler-core";

import { ElementIdPositions, TextPosition } from "./elementIdPositions";

/** The per-finding scan the index replaces; positions must stay identical to it. */
function searchPerId(xml: string, id: string): TextPosition | undefined {
    const offset = xml.search(new RegExp(`\\sid=["']${escapeRegExpLiteral(id)}["']`));
    if (offset < 0) {
        return undefined;
    }
    const before = xml.slice(0, offset);
    return {
        line: before.split("\n").length - 1,
        character: offset - (before.lastIndexOf("\n") + 1),
    };
}

function expectSameAsPerIdSearch(xml: string, ids: string[]): void {
    const positions = new ElementIdPositions(xml);
    for (const id of ids) {
        expect(positions.positionOf(id), id).toEqual(searchPerId(xml, id));
    }
}

describe("ElementIdPositions", () => {
    it("locates ids on a single line", () => {
        const xml = `<?xml version="1.0"?><bpmn:task id="Task_1" /><bpmn:process id="Process_1" />`;

        expect(new ElementIdPositions(xml).positionOf("Process_1")).toEqual({
            line: 0,
            character: xml.indexOf(` id="Process_1"`),
        });
        expectSameAsPerIdSearch(xml, ["Task_1", "Process_1"]);
    });

    it("locates ids across LF and CRLF lines", () => {
        const xml = `<definitions>\n  <task id="A" />\r\n  <task\tid='B' />\n<task id="C"/>`;

        expect(new ElementIdPositions(xml).positionOf("B")).toEqual({ line: 2, character: 7 });
        expectSameAsPerIdSearch(xml, ["A", "B", "C"]);
    });

    it("points at the end of the previous line when the attribute starts a line", () => {
        const xml = `<task\nid="Wrapped" />`;

        expect(new ElementIdPositions(xml).positionOf("Wrapped")).toEqual({
            line: 0,
            character: 5,
        });
        expectSameAsPerIdSearch(xml, ["Wrapped"]);
    });

    it("keeps the first occurrence of a duplicate id", () => {
        const xml = `<a id="Dup" />\n<b id="Dup" />`;

        expect(new ElementIdPositions(xml).positionOf("Dup")).toEqual({ line: 0, character: 2 });
    });

    it("returns nothing for an id that does not occur as an attribute", () => {
        const xml = `<task name="Missing" processRef="Missing" bpmn:id="Missing" />`;

        expect(new ElementIdPositions(xml).positionOf("Missing")).toBeUndefined();
    });

    it("matches like the per-id search for mismatched quotes and overlapping attributes", () => {
        const xml = `<a id="Mixed' />\n<b x=" id="Overlap" />\n<c id=" id="Inner" />`;

        expectSameAsPerIdSearch(xml, ["Mixed", "Overlap", "Inner", " id="]);
    });

    it("falls back to the per-id search for ids containing quotes", () => {
        const xml = `<a id='Say"hi' />`;

        expectSameAsPerIdSearch(xml, [`Say"hi`, "Say"]);
    });
});
