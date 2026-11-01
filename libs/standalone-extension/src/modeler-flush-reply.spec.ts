import { describe, expect, it } from "vitest";

import {
    decideFlushWrite,
    type FlushReply,
    type FlushWriteDecision,
    parseFlushReply,
    type PendingSyncObservation,
} from "./modeler-flush-reply";

describe("parseFlushReply", () => {
    it.each<{ message: Record<string, unknown>; reply: FlushReply | undefined; case: string }>([
        {
            case: "an export from a page that sends no status",
            message: { content: "<x/>" },
            reply: { status: "flushed", content: "<x/>" },
        },
        {
            case: "a page that sends neither status nor content",
            message: {},
            reply: { status: "clean" },
        },
        {
            case: "a null content without status",
            message: { content: null },
            reply: { status: "clean" },
        },
        {
            case: "an export with its revision",
            message: { status: "flushed", content: "<x/>", documentRevision: 3 },
            reply: { status: "flushed", content: "<x/>", documentRevision: 3 },
        },
        {
            case: "a clean reply with the revision the page represents",
            message: { status: "clean", documentRevision: 2 },
            reply: { status: "clean", documentRevision: 2 },
        },
        {
            case: "a host-updated reply with the revision the page represents",
            message: { status: "host-updated", documentRevision: 2 },
            reply: { status: "host-updated", documentRevision: 2 },
        },
        {
            case: "an unavailable reply",
            message: { status: "unavailable" },
            reply: { status: "unavailable" },
        },
        {
            case: "a clean reply that also carries content",
            message: { status: "clean", content: "<x/>" },
            reply: { status: "clean" },
        },
        {
            case: "an export without content",
            message: { status: "flushed" },
            reply: { status: "unavailable" },
        },
        {
            case: "an unknown status",
            message: { status: "restored", content: "<x/>" },
            reply: { status: "unavailable" },
        },
        {
            case: "a revision that is not a number",
            message: { status: "clean", documentRevision: "2" },
            reply: { status: "clean" },
        },
        {
            case: "content that is not text",
            message: { status: "flushed", content: 42 },
            reply: undefined,
        },
    ])("reads $case", ({ message, reply }) => {
        expect(parseFlushReply(message)).toEqual(reply);
    });
});

describe("decideFlushWrite", () => {
    const syncAt = (documentRevision: number): PendingSyncObservation => ({
        status: "synced",
        content: "<page/>",
        documentRevision,
    });
    const failedSync: PendingSyncObservation = { status: "failed" };
    const keepHostDocument: FlushWriteDecision = { kind: "keepHostDocument" };
    const syncFailed: FlushWriteDecision = { kind: "syncFailed" };
    const writeObservedSync: FlushWriteDecision = {
        kind: "writeObservedSync",
        content: "<page/>",
    };

    it.each<{
        case: string;
        reply: FlushReply;
        observation: PendingSyncObservation | undefined;
        decision: FlushWriteDecision;
    }>([
        {
            case: "writes an export",
            reply: { status: "flushed", content: "<export/>" },
            observation: syncAt(1),
            decision: { kind: "writeExport", content: "<export/>" },
        },
        {
            case: "writes an export after a sync failed, since the export holds the edit",
            reply: { status: "flushed", content: "<export/>" },
            observation: failedSync,
            decision: { kind: "writeExport", content: "<export/>" },
        },
        {
            case: "keeps the host document on host-updated although a sync is unconfirmed",
            reply: { status: "host-updated", documentRevision: 1 },
            observation: syncAt(1),
            decision: keepHostDocument,
        },
        {
            case: "keeps the host document on host-updated without a sync",
            reply: { status: "host-updated" },
            observation: undefined,
            decision: keepHostDocument,
        },
        {
            case: "keeps the host document on a clean reply without a sync",
            reply: { status: "clean", documentRevision: 1 },
            observation: undefined,
            decision: keepHostDocument,
        },
        {
            case: "keeps the host document when the page imported a newer revision than its sync",
            reply: { status: "clean", documentRevision: 2 },
            observation: syncAt(1),
            decision: keepHostDocument,
        },
        {
            case: "falls back to the sync when a clean reply represents the sync's revision",
            reply: { status: "clean", documentRevision: 1 },
            observation: syncAt(1),
            decision: writeObservedSync,
        },
        {
            case: "falls back to the sync when an older page sends no revision",
            reply: { status: "clean" },
            observation: syncAt(0),
            decision: writeObservedSync,
        },
        {
            case: "falls back to the sync when the page could not flush",
            reply: { status: "unavailable" },
            observation: syncAt(1),
            decision: writeObservedSync,
        },
        {
            case: "keeps the host document when the page could not flush and sent no sync",
            reply: { status: "unavailable" },
            observation: undefined,
            decision: keepHostDocument,
        },
        {
            case: "refuses after a failed sync on a clean reply",
            reply: { status: "clean", documentRevision: 1 },
            observation: failedSync,
            decision: syncFailed,
        },
        {
            case: "refuses after a failed sync on a host-updated reply",
            reply: { status: "host-updated", documentRevision: 1 },
            observation: failedSync,
            decision: syncFailed,
        },
    ])("$case", ({ reply, observation, decision }) => {
        expect(decideFlushWrite(reply, observation)).toEqual(decision);
    });
});
