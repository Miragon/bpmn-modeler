import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";

import type {
    DocumentFlushStatus,
    FlushReply as SharedFlushReply,
    FlushWriteDecision as SharedFlushWriteDecision,
    ObservedPageSync as SharedObservedPageSync,
} from "@miragon/bpmn-modeler-shared";

import {
    decideFlushWrite,
    type FlushReply,
    type FlushReplyStatus,
    type FlushWriteDecision,
    type ObservedPageSync,
    parseFlushReply,
} from "./modeler-flush-reply";

const CASES = JSON.parse(
    readFileSync(resolve(__dirname, "../../shared/src/lib/documentFlushReply.cases.json"), "utf8"),
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

describe("the copy of the shared flush reply table", () => {
    it("keeps the shared types", () => {
        expectTypeOf<FlushReplyStatus>().toEqualTypeOf<DocumentFlushStatus>();
        expectTypeOf<FlushReply>().toEqualTypeOf<SharedFlushReply>();
        expectTypeOf<ObservedPageSync>().toEqualTypeOf<SharedObservedPageSync>();
        expectTypeOf<FlushWriteDecision>().toEqualTypeOf<SharedFlushWriteDecision>();
    });

    it.each(CASES.parse)("reads $case", ({ message, reply }) => {
        expect(parseFlushReply(message) ?? null).toEqual(reply);
    });

    it.each(CASES.decide)("$case", ({ reply, observedSync, destructive, decision }) => {
        expect(decideFlushWrite(reply, observedSync ?? undefined, destructive)).toEqual(decision);
    });
});
