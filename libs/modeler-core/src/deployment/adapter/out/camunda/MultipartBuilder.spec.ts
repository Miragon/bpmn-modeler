import { describe, expect, it } from "vitest";

import { MultipartBuilder } from "./MultipartBuilder";

describe("MultipartBuilder", () => {
    it("encodes a text field with its boundary, disposition and CRLFs", () => {
        const builder = new MultipartBuilder();

        const { body, boundary } = builder.addField("deploymentName", "my-process").build();

        expect(body.toString("utf-8")).toBe(
            `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="deploymentName"\r\n\r\n` +
                `my-process\r\n` +
                `--${boundary}--\r\n`,
        );
    });

    it("encodes a file part with filename, content type and preserves UTF-8 content", () => {
        const builder = new MultipartBuilder();
        const content = "<process>wörd</process>";

        const { body, boundary } = builder.addFile("data", "model.bpmn", content).build();

        expect(body.toString("utf-8")).toBe(
            `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="data"; filename="model.bpmn"\r\n` +
                `Content-Type: application/octet-stream\r\n\r\n` +
                `${content}\r\n` +
                `--${boundary}--\r\n`,
        );
    });

    it("preserves multi-byte file content byte-for-byte", () => {
        const content = "café — 日本語";

        const { body } = new MultipartBuilder().addFile("data", "f.txt", content).build();

        // The file bytes sit between the part header and the trailing CRLF, so
        // asserting on the raw UTF-8 length proves no transcoding occurred.
        expect(body.includes(Buffer.from(content, "utf-8"))).toBe(true);
    });

    it("appends the closing boundary matching the parts' boundary on build", () => {
        const { body, boundary } = new MultipartBuilder().addField("a", "b").build();

        expect(boundary).toMatch(/^----BpmnDeployBoundary/);
        expect(body.toString("utf-8").endsWith(`--${boundary}--\r\n`)).toBe(true);
    });

    it("returns this from addField and addFile for chaining", () => {
        const builder = new MultipartBuilder();

        expect(builder.addField("a", "b")).toBe(builder);
        expect(builder.addFile("c", "d.txt", "e")).toBe(builder);
    });
});
