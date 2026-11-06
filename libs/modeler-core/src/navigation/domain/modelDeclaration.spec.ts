import { describe, expect, it } from "vitest";

import type { ReferenceKind } from "@miragon/bpmn-modeler-types";

import {
    declaresReferencedModel,
    declaringFileExtension,
    formIdDeclaredIn,
} from "./modelDeclaration";

const bpmn = (processId: string, targetNamespace = "http://bpmn.io/schema/bpmn") =>
    `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="${targetNamespace}">
  <bpmn:process id="${processId}" isExecutable="true"/>
</bpmn:definitions>`;

const dmn = (decisionId: string) =>
    `<?xml version="1.0"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" namespace="http://camunda.org/schema/1.0/dmn">
  <decision id = '${decisionId}' name="d"/>
</definitions>`;

const form = (schema: Record<string, unknown>) => JSON.stringify(schema);

describe("declaresReferencedModel", () => {
    it.each([
        {
            behaviour: "matches a process id without a namespace",
            content: bpmn("Process_Target"),
            reference: { id: "Process_Target", kind: "process" as const },
            expected: true,
        },
        {
            behaviour: "rejects another process id",
            content: bpmn("Process_Other"),
            reference: { id: "Process_Target", kind: "process" as const },
            expected: false,
        },
        {
            behaviour: "matches a process id in the referenced namespace",
            content: bpmn("Process_Target", "urn:example:child"),
            reference: {
                id: "Process_Target",
                kind: "process" as const,
                namespace: "urn:example:child",
            },
            expected: true,
        },
        {
            behaviour: "rejects a process id declared in another namespace",
            content: bpmn("Process_Target", "urn:example:other"),
            reference: {
                id: "Process_Target",
                kind: "process" as const,
                namespace: "urn:example:child",
            },
            expected: false,
        },
        {
            behaviour: "rejects a namespace that is only a prefix of the target namespace",
            content: bpmn("Process_Target", "urn:example:child-v2"),
            reference: {
                id: "Process_Target",
                kind: "process" as const,
                namespace: "urn:example:child",
            },
            expected: false,
        },
        {
            behaviour: "rejects a process whose name, not id, equals the reference",
            content: `<bpmn:process id="Process_Other" name="Process_Target"/>`,
            reference: { id: "Process_Target", kind: "process" as const },
            expected: false,
        },
        {
            behaviour: "rejects a caller that only binds a prefix to the namespace",
            content: bpmn("Process_Target", "urn:example:caller").replace(
                "<bpmn:definitions ",
                '<bpmn:definitions xmlns:child="urn:example:child" ',
            ),
            reference: {
                id: "Process_Target",
                kind: "process" as const,
                namespace: "urn:example:child",
            },
            expected: false,
        },
        {
            behaviour: "rejects the namespace on an element other than the definitions",
            content: bpmn("Process_Target", "urn:example:caller").replace(
                "</bpmn:definitions>",
                '<xsd:schema targetNamespace="urn:example:child"/></bpmn:definitions>',
            ),
            reference: {
                id: "Process_Target",
                kind: "process" as const,
                namespace: "urn:example:child",
            },
            expected: false,
        },
        {
            behaviour: "matches a decision id with spaces and single quotes",
            content: dmn("Decision_1"),
            reference: { id: "Decision_1", kind: "decision" as const },
            expected: true,
        },
        {
            behaviour: "ignores a declaration inside a comment",
            content: `<!-- <bpmn:process id="Process_Target"/> -->${bpmn("Process_Other")}`,
            reference: { id: "Process_Target", kind: "process" as const },
            expected: false,
        },
        {
            behaviour: "rejects a process when a decision is referenced",
            content: bpmn("Decision_1"),
            reference: { id: "Decision_1", kind: "decision" as const },
            expected: false,
        },
        {
            behaviour: "matches the top-level id of a form",
            content: form({ id: "Form_Request", components: [] }),
            reference: { id: "Form_Request", kind: "form" as const },
            expected: true,
        },
        {
            behaviour: "rejects another form id",
            content: form({ id: "Form_Other" }),
            reference: { id: "Form_Request", kind: "form" as const },
            expected: false,
        },
        {
            behaviour: "rejects a form that only nests the id in a component",
            content: form({ components: [{ id: "Form_Request" }] }),
            reference: { id: "Form_Request", kind: "form" as const },
            expected: false,
        },
        {
            behaviour: "rejects a BPMN file whose process has the form id",
            content: bpmn("Form_Request"),
            reference: { id: "Form_Request", kind: "form" as const },
            expected: false,
        },
    ])("$behaviour", ({ content, reference, expected }) => {
        expect(declaresReferencedModel(content, reference)).toBe(expected);
    });
});

describe("declaringFileExtension", () => {
    it.each<[ReferenceKind, string]>([
        ["process", ".bpmn"],
        ["decision", ".dmn"],
        ["form", ".form"],
    ])("finds a %s in a %s file", (kind, extension) => {
        expect(declaringFileExtension(kind)).toBe(extension);
    });
});

describe("formIdDeclaredIn", () => {
    it.each([
        {
            behaviour: "reads the top-level id",
            content: form({ id: "Form_A" }),
            expected: "Form_A",
        },
        { behaviour: "ignores an empty id", content: form({ id: "" }), expected: undefined },
        {
            behaviour: "ignores an id that is no string",
            content: form({ id: 7 }),
            expected: undefined,
        },
        {
            behaviour: "ignores an id that is a list",
            content: form({ id: ["Form_A"] }),
            expected: undefined,
        },
        {
            behaviour: "ignores an id nested in a component",
            content: form({ components: [{ id: "Form_A" }] }),
            expected: undefined,
        },
        { behaviour: "ignores malformed JSON", content: "{", expected: undefined },
        { behaviour: "ignores JSON null", content: "null", expected: undefined },
    ])("$behaviour", ({ content, expected }) => {
        expect(formIdDeclaredIn(content)).toBe(expected);
    });
});
