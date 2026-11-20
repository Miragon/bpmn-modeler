import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { LogInfoCommand, ShowInfoCommand, SyncDocumentCommand } from "./messages";
import {
    type PreviewCommandTable,
    type PreviewRoute,
    previewRouteOf,
    routePreviewCommand,
} from "./previewCommandTable";

type SampleCommand = LogInfoCommand | ShowInfoCommand | SyncDocumentCommand;

interface SampleSession {
    readonly answered: string[];
}

const SAMPLE_TABLE: PreviewCommandTable<SampleCommand, SampleSession> = {
    LogInfoCommand: ({ message }, session) => session.answered.push(message),
    ShowInfoCommand: ({ message }, session) => session.answered.push(`shown ${message}`),
    SyncDocumentCommand: { ignored: "the sample has no file to write to" },
};

afterEach(() => {
    vi.restoreAllMocks();
});

// Type-level spec: the `typecheck` script fails when an expectation breaks.
describe("PreviewCommandTable", () => {
    it("hands each row only commands of its own type", () => {
        expectTypeOf<
            PreviewCommandTable<SampleCommand, SampleSession>["LogInfoCommand"]
        >().toEqualTypeOf<PreviewRoute<LogInfoCommand, SampleSession>>();
    });

    it("fails to compile without a row per command type", () => {
        // @ts-expect-error SyncDocumentCommand has no row.
        const incomplete: PreviewCommandTable<SampleCommand, SampleSession> = {
            LogInfoCommand: { ignored: "sample" },
            ShowInfoCommand: { ignored: "sample" },
        };

        expect(incomplete).toBeDefined();
    });
});

describe("routePreviewCommand", () => {
    it("passes a command and the session to its row", () => {
        const session: SampleSession = { answered: [] };

        routePreviewCommand(SAMPLE_TABLE, new LogInfoCommand("ready"), session);
        routePreviewCommand(SAMPLE_TABLE, new ShowInfoCommand("saved"), session);

        expect(session.answered).toEqual(["ready", "shown saved"]);
    });

    it("says why it drops a command whose row is ignored", () => {
        const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
        const command = new SyncDocumentCommand("<xml/>");

        routePreviewCommand(SAMPLE_TABLE, command, { answered: [] });

        expect(debug).toHaveBeenCalledWith(
            "[DEBUG] SyncDocumentCommand ignored: the sample has no file to write to",
            command,
        );
    });

    it.each(["NotACommand", "toString", "constructor", "hasOwnProperty"])(
        "rejects a command of type %s, which has no row",
        (type) => {
            const session: SampleSession = { answered: [] };

            expect(() =>
                routePreviewCommand(SAMPLE_TABLE, { type } as unknown as SampleCommand, session),
            ).toThrow(`Unknown message type: ${type}`);
            expect(session.answered).toEqual([]);
        },
    );
});

describe("previewRouteOf", () => {
    it("returns the row of a command type", () => {
        expect(previewRouteOf(SAMPLE_TABLE, "SyncDocumentCommand")).toEqual({
            ignored: "the sample has no file to write to",
        });
    });
});
