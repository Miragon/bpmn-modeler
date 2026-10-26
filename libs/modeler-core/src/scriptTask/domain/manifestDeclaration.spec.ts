import { describe, expect, it } from "vitest";

import { declareInManifest } from "./manifestDeclaration";

const ORDER_ID_ONLY_MANIFEST =
    '{\n  "variables": [\n    {\n      "name": "orderId"\n    }\n  ]\n}\n';

describe("declareInManifest", () => {
    it("starts a fresh manifest when none exists", () => {
        expect(declareInManifest(undefined, { name: "orderId" })).toEqual({
            kind: "declared",
            manifestText: ORDER_ID_ONLY_MANIFEST,
        });
    });

    it("appends after existing entries and keeps unknown top-level fields", () => {
        const manifestText = JSON.stringify({
            $schema: "./vars.schema.json",
            variables: [{ name: "orderId", type: "String" }],
            owner: "billing",
        });
        const amount = { name: "amount", type: "Long" };

        expect(declareInManifest(manifestText, amount)).toEqual({
            kind: "declared",
            manifestText: [
                "{",
                '  "$schema": "./vars.schema.json",',
                '  "variables": [',
                "    {",
                '      "name": "orderId",',
                '      "type": "String"',
                "    },",
                "    {",
                '      "name": "amount",',
                '      "type": "Long"',
                "    }",
                "  ],",
                '  "owner": "billing"',
                "}",
                "",
            ].join("\n"),
        });
    });

    it.each([
        ["compact", '{"variables":[{"name":"amount"},{"name":"orderId","type":"String"}]}'],
        [
            "hand-formatted one-line",
            '{ "variables": [ { "name": "amount" }, { "name": "orderId", "type": "String" } ] }',
        ],
        [
            "tab-indented",
            '{\n\t"variables": [\n\t\t{ "name": "amount" },\n\t\t{ "name": "orderId" }\n\t]\n}',
        ],
    ])(
        "reports a name the %s manifest already lists as alreadyDeclared",
        (_formatting, manifestText) => {
            expect(declareInManifest(manifestText, { name: "orderId" })).toEqual({
                kind: "alreadyDeclared",
            });
        },
    );

    it("keys the declaration on the name alone, so an existing entry is never overwritten", () => {
        const manifestText = '{ "variables": [ { "name": "orderId", "type": "String" } ] }';
        const retypedOrderId = { name: "orderId", type: "Long" };

        expect(declareInManifest(manifestText, retypedOrderId)).toEqual({
            kind: "alreadyDeclared",
        });
    });

    it.each([
        [
            "missing",
            '{ "$schema": "./vars.schema.json" }',
            '{\n  "$schema": "./vars.schema.json",\n  "variables": [\n    {\n      "name": "orderId"\n    }\n  ]\n}\n',
        ],
        ["null", '{ "variables": null }', ORDER_ID_ONLY_MANIFEST],
        [
            "an object holding the name",
            '{ "variables": { "name": "orderId" } }',
            ORDER_ID_ONLY_MANIFEST,
        ],
    ])("declares the entry when the variables key is %s", (_case, manifestText, declaredText) => {
        expect(declareInManifest(manifestText, { name: "orderId" })).toEqual({
            kind: "declared",
            manifestText: declaredText,
        });
    });

    it.each([
        ["unterminated", "{ not json"],
        ["empty", ""],
        ["trailing-comma", '{ "variables": [], }'],
    ])("throws on %s JSON so hand-edited content is never overwritten", (_case, manifestText) => {
        expect(() => declareInManifest(manifestText, { name: "orderId" })).toThrow(SyntaxError);
    });

    it.each([
        ["an array", '[{ "name": "orderId" }]'],
        ["null", "null"],
        ["a string", '"orderId"'],
        ["a number", "42"],
    ])("throws when the top level is %s", (_case, manifestText) => {
        const declare = () => declareInManifest(manifestText, { name: "orderId" });

        expect(declare).toThrow(SyntaxError);
        expect(declare).toThrow("The variable manifest must be a JSON object.");
    });
});
