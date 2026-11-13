import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
    decideFlushWrite,
    type FlushReply,
    type FlushWriteDecision,
    type ObservedPageSync,
    parseFlushReply,
} from "./documentFlush";
import { DOCUMENT_FLUSH_STATUSES, DocumentFlushedCommand } from "./messages";

// The Theia frontend's copy and the IntelliJ host run the same rows.
const CASES = JSON.parse(
    readFileSync(resolve(__dirname, "documentFlushReply.cases.json"), "utf8"),
) as {
    parse: { case: string; message: Record<string, unknown>; reply: FlushReply | null }[];
    decide: {
        case: string;
        reply: FlushReply;
        observedSync: ObservedPageSync | null;
        destructive: boolean;
        decision: FlushWriteDecision;
    }[];
};

describe("parseFlushReply", () => {
    it.each(CASES.parse)("reads $case", ({ message, reply }) => {
        expect(parseFlushReply(message) ?? null).toEqual(reply);
    });

    it("has a row for every status a page sends", () => {
        const statuses = CASES.parse.map((row) => row.message.status);

        expect(DOCUMENT_FLUSH_STATUSES.filter((status) => !statuses.includes(status))).toEqual([]);
    });

    it("reads the reply the page posts", () => {
        expect(parseFlushReply(new DocumentFlushedCommand(4, "<x/>", "flushed", 2))).toEqual({
            status: "flushed",
            content: "<x/>",
            documentRevision: 2,
        });
    });
});

describe("decideFlushWrite", () => {
    it.each(CASES.decide)("$case", ({ reply, observedSync, destructive, decision }) => {
        expect(decideFlushWrite(reply, observedSync ?? undefined, destructive)).toEqual(decision);
    });

    it("has a row for every status a page sends", () => {
        const statuses = new Set(CASES.decide.map((row) => row.reply.status));

        expect(DOCUMENT_FLUSH_STATUSES.filter((status) => !statuses.has(status))).toEqual([]);
    });
});
