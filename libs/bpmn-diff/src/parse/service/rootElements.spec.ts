import { describe, expect, it } from "vitest";

import { rootElementNamesOf } from "./rootElements";

const BPMN_URI = "http://www.omg.org/spec/BPMN/20100524/MODEL";

describe("rootElementNamesOf", () => {
    it.each([
        {
            name: "a prefixed root with its declaration",
            text: `<bpmn:task xmlns:bpmn="${BPMN_URI}" id="Task_1"><bpmn:documentation>x</bpmn:documentation></bpmn:task>`,
            roots: [{ localName: "task", namespace: BPMN_URI }],
        },
        {
            name: "a root in the default namespace",
            text: `<userTask xmlns="${BPMN_URI}" id="Task_1" />`,
            roots: [{ localName: "userTask", namespace: BPMN_URI }],
        },
        {
            name: "a root whose prefix it does not declare",
            text: `<bpmn:task id="Task_1" />`,
            roots: [{ localName: "task" }],
        },
        {
            name: "two roots, the first self-closing",
            text: `<a:task xmlns:a="urn:a" /><b:task xmlns:b="urn:b"><b:inner /></b:task>`,
            roots: [
                { localName: "task", namespace: "urn:a" },
                { localName: "task", namespace: "urn:b" },
            ],
        },
        { name: "no element", text: "  ", roots: [] },
    ])("reads $name", async ({ text, roots }) => {
        expect(await rootElementNamesOf(text)).toEqual(roots);
    });
});
