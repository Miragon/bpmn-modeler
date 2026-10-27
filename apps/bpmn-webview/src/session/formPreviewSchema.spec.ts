import { describe, expect, it } from "vitest";
import { parsePreviewSchema } from "./formPreviewSchema";

describe("preview schema safety", () => {
    it("parses a form without changing its schema", () => {
        const schema = {
            type: "default",
            components: [{ type: "textfield", key: "name", id: "Name" }],
        };
        expect(parsePreviewSchema(JSON.stringify(schema))).toEqual(schema);
    });

    it.each([
        "bad JSON",
        "null",
        "[]",
        "{}",
        '{"components":[{"type":"iframe"}]}',
        '{"components":[{"type":"documentPreview"}]}',
        '{"components":[{"type":"unknown"}]}',
        '{"components":[{"type":"group","components":[{"type":"iframe"}]}]}',
    ])("rejects invalid or unsupported forms with usable feedback: %s", (content) => {
        expect(() => parsePreviewSchema(content)).toThrow(/form|component/i);
    });
});
