import { describe, expect, it } from "vitest";

import { JsonFormTextEdits } from "./JsonFormTextEdits";

const metadata = { executionPlatform: "Camunda Platform", executionPlatformVersion: "7" };
const edits = new JsonFormTextEdits();

describe("Form source metadata edits", () => {
    it.each([
        '{"executionPlatform":"Camunda Cloud","executionPlatform":"Other","executionPlatformVersion":"8.8.0"}',
        '{"executionPlatform":"Camunda Cloud","executionPlatformVersion":"8.8.0","executionPlatformVersion":"99"}',
        String.raw`{"executionPlatform":"Camunda Cloud","execution\u0050latform":"Other","executionPlatformVersion":"8.8.0"}`,
        String.raw`{"executionPlatform":"Camunda Cloud","executionPlatformVersion":"8.8.0","executionPlatformVersi\u006fn":"99"}`,
    ])(
        "declines ambiguous duplicate metadata rather than returning a mixed engine pair: %s",
        (source) => {
            expect(edits.withEngine(source, metadata)).toBeUndefined();
        },
    );

    it("changes only the two metadata values, preserving schemaVersion and custom content byte-for-byte", () => {
        const source =
            '{\r\n\t"schemaVersion" : 18, "components": [ ],\r\n\t"executionPlatform": "Camunda Cloud",\r\n\t"executionPlatformVersion": "8.8.0", "custom": {"x": 1}\r\n}\r\n';
        expect(edits.withEngine(source, metadata)).toBe(
            source.replace('"Camunda Cloud"', '"Camunda Platform"').replace('"8.8.0"', '"7"'),
        );
    });

    it.each([
        "{}",
        '{\n  "schemaVersion": 18,\n  "components": []\n}\n',
        '{"executionPlatform":null,"executionPlatformVersion":19}',
    ])("adds or replaces both fields without replacing other properties in %s", (source) => {
        const updated = edits.withEngine(source, metadata);
        expect(updated).toBeDefined();
        expect(JSON.parse(updated!)).toEqual({ ...JSON.parse(source), ...metadata });
    });

    it.each(["{", "[]", "null", '{"components":[],}', '{/* comment */"components":[]}'])(
        "refuses invalid JSON or a non-object root without repairing it: %s",
        (source) => {
            expect(edits.withEngine(source, metadata)).toBeUndefined();
        },
    );
});
