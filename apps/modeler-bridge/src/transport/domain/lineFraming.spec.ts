import { describe, expect, it } from "vitest";

import { createLineSplitter } from "./lineFraming";

function collectLines(chunks: string[]): string[] {
    const lines: string[] = [];
    const splitLines = createLineSplitter((line) => lines.push(line));
    chunks.forEach(splitLines);
    return lines;
}

function splitIntoChunks(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let offset = 0; offset < text.length; offset += chunkSize) {
        chunks.push(text.slice(offset, offset + chunkSize));
    }
    return chunks;
}

describe("createLineSplitter", () => {
    it("reassembles a multi-MB line delivered in many small chunks", () => {
        const largeFrame = JSON.stringify({
            method: "document/didChange",
            params: { content: '<bpmn:task id="t" />'.repeat(150_000) },
        });
        expect(largeFrame.length).toBeGreaterThan(3_000_000);

        const lines = collectLines(splitIntoChunks(`${largeFrame}\n{"next":1}\n`, 64 * 1024));

        expect(lines).toHaveLength(2);
        expect(lines[0]).toBe(largeFrame);
        expect(lines[1]).toBe('{"next":1}');
    });

    it("emits every line of a chunk carrying several frames", () => {
        expect(collectLines(['{"a":1}\n{"b":2}\n{"c":3}\n'])).toEqual([
            '{"a":1}',
            '{"b":2}',
            '{"c":3}',
        ]);
    });

    it("handles a newline at the very start or end of a chunk", () => {
        expect(collectLines(['{"a":', "1}", '\n{"b":2}\n', "\n"])).toEqual([
            '{"a":1}',
            '{"b":2}',
            "",
        ]);
    });

    it("retains a trailing partial line until its terminator arrives", () => {
        const lines: string[] = [];
        const splitLines = createLineSplitter((line) => lines.push(line));

        splitLines('{"a":1}\n{"b":');
        expect(lines).toEqual(['{"a":1}']);

        splitLines("2}\n");
        expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    });

    it("keeps multibyte characters intact across chunk boundaries", () => {
        const frame = '{"name":"Prüfung 🚀 ✓"}';
        expect(collectLines([...splitIntoChunks(frame, 3), "\n"])).toEqual([frame]);
    });

    it("passes carriage returns through untouched", () => {
        expect(collectLines(['{"a":1}\r\n'])).toEqual(['{"a":1}\r']);
    });
});
