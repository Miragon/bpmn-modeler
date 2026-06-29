import { describe, expect, it } from "vitest";

import { parseVariableManifest } from "./variableManifest";

const MANIFEST = "diagram.bpmn.vars.json";

describe("parseVariableManifest", () => {
    it("maps entries to authored variables with name, type, and description", () => {
        const vars = parseVariableManifest(
            JSON.stringify({
                variables: [
                    { name: "orderId", type: "String", description: "Set by REST start" },
                ],
            }),
            MANIFEST,
        );

        expect(vars).toEqual([
            {
                name: "orderId",
                origin: `declared in ${MANIFEST}`,
                typeHint: "String",
                description: "Set by REST start",
                confidence: "authored",
            },
        ]);
    });

    it("leaves typeHint and description undefined when omitted or empty", () => {
        const vars = parseVariableManifest(
            JSON.stringify({ variables: [{ name: "amount", type: "", description: "" }] }),
            MANIFEST,
        );

        expect(vars[0].typeHint).toBeUndefined();
        expect(vars[0].description).toBeUndefined();
        expect(vars[0].confidence).toBe("authored");
    });

    it("skips entries with a missing or empty name", () => {
        const vars = parseVariableManifest(
            JSON.stringify({ variables: [{ name: "" }, { type: "String" }, { name: "keep" }] }),
            MANIFEST,
        );

        expect(vars.map((v) => v.name)).toEqual(["keep"]);
    });

    it("returns [] on invalid JSON rather than throwing", () => {
        expect(parseVariableManifest("{ not json", MANIFEST)).toEqual([]);
    });

    it("returns [] when variables is missing or not an array", () => {
        expect(parseVariableManifest(JSON.stringify({}), MANIFEST)).toEqual([]);
        expect(parseVariableManifest(JSON.stringify({ variables: 42 }), MANIFEST)).toEqual([]);
        expect(parseVariableManifest(JSON.stringify([]), MANIFEST)).toEqual([]);
    });
});
