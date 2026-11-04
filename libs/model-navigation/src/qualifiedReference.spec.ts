import { describe, expect, it } from "vitest";

import { resolveQualifiedReference, type ModdleElementLike } from "./qualifiedReference";

const definitions: ModdleElementLike = {
    $attrs: {
        "xmlns:bpmn": "http://www.omg.org/spec/BPMN/20100524/MODEL",
        "xmlns:child": "urn:example:child",
    },
};
const process: ModdleElementLike = { $parent: definitions };
const callActivity: ModdleElementLike = { $parent: process };

describe("resolveQualifiedReference", () => {
    it.each([
        {
            behaviour: "resolves a prefix bound on the definitions",
            reference: "child:Process_Target",
            expected: { id: "Process_Target", namespace: "urn:example:child" },
        },
        {
            behaviour: "keeps an unprefixed reference literal",
            reference: "Process_Target",
            expected: { id: "Process_Target" },
        },
        {
            behaviour: "falls back to the local part for an unbound prefix",
            reference: "unknown:Process_Target",
            expected: { id: "Process_Target" },
        },
        {
            behaviour: "keeps an expression literal",
            reference: "${cond ? 'a' : 'b'}",
            expected: { id: "${cond ? 'a' : 'b'}" },
        },
        {
            behaviour: "keeps a value with more than one colon literal",
            reference: "a:b:c",
            expected: { id: "a:b:c" },
        },
    ])("$behaviour", ({ reference, expected }) => {
        expect(resolveQualifiedReference(reference, callActivity)).toEqual(expected);
    });

    it("prefers the declaration nearest to the element", () => {
        const scoped: ModdleElementLike = {
            $parent: process,
            $attrs: { "xmlns:child": "urn:example:inner" },
        };

        expect(resolveQualifiedReference("child:Process_Target", scoped)).toEqual({
            id: "Process_Target",
            namespace: "urn:example:inner",
        });
    });
});
