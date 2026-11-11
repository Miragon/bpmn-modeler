import { describe, expect, it } from "vitest";

import type { ModdleElement } from "./moddleElement";
import { signature } from "./signature";

function element(
    type: string,
    id: string,
    properties: Record<string, unknown>,
    references: string[] = [],
): ModdleElement {
    return {
        $type: type,
        id,
        ...properties,
        $descriptor: {
            properties: [
                { name: "id" },
                ...Object.keys(properties).map((name) => ({
                    name,
                    isReference: references.includes(name),
                })),
            ],
        },
    };
}

describe("signature", () => {
    it("names a referenced element by its id, so two elements that reference each other terminate", () => {
        const decision = element(
            "dmn:Decision",
            "D1",
            { name: "Choose carrier", owner: undefined },
            ["owner"],
        );
        const unit = element(
            "dmn:OrganisationalUnit",
            "O1",
            { name: "Sales", decisionMade: [decision] },
            ["decisionMade"],
        );
        Object.assign(decision, { owner: unit });

        expect(signature(unit)).toBe(
            '{"$type":"dmn:OrganisationalUnit","name":"Sales","decisionMade":["#D1"]}',
        );
        expect(signature(decision)).toBe(
            '{"$type":"dmn:Decision","name":"Choose carrier","owner":"#O1"}',
        );
    });

    it("leaves out namespace declarations but keeps other unknown attributes", () => {
        const withAttributes = {
            ...element("dmn:InputData", "I1", { name: "Weight" }),
            $attrs: { "xmlns:acme": "urn:acme", "acme:owner": "sales" },
        };

        expect(signature(withAttributes)).toBe(
            '{"$type":"dmn:InputData","name":"Weight","@acme:owner":"sales"}',
        );
    });

    it("signs a missing element as null", () => {
        expect(signature(undefined)).toBe("null");
    });
});
