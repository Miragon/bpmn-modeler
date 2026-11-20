import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { GetAddOnCatalogCommand, OpenAddOnDetailCommand } from "./addOnsView";
import { LogInfoCommand } from "./messages";
import {
    type PreviewCommandTable,
    type PreviewRoute,
    previewRouteOf,
    routePreviewCommand,
} from "./previewCommandTable";

type TestCommand = LogInfoCommand | GetAddOnCatalogCommand | OpenAddOnDetailCommand;

interface TestSession {
    readonly handled: string[];
}

const TABLE: PreviewCommandTable<TestCommand, TestSession> = {
    LogInfoCommand: ({ message }, session) => session.handled.push(message),
    GetAddOnCatalogCommand: ({ type }, session) => session.handled.push(type),
    OpenAddOnDetailCommand: { ignored: "the test has no tab to open" },
};

describe("a browser preview's command table", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("keys a row by each command of the surface, and hands the row that command", () => {
        type Table = PreviewCommandTable<TestCommand, TestSession>;

        expectTypeOf<keyof Table>().toEqualTypeOf<TestCommand["type"]>();
        expectTypeOf<Table["OpenAddOnDetailCommand"]>().toEqualTypeOf<
            PreviewRoute<OpenAddOnDetailCommand, TestSession>
        >();
    });

    it("hands a command to its row together with the session", () => {
        const session: TestSession = { handled: [] };

        routePreviewCommand(TABLE, new LogInfoCommand("hello"), session);

        expect(session.handled).toEqual(["hello"]);
    });

    it("drops a command whose row gives a reason, and logs the reason on one debug line", () => {
        const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
        const session: TestSession = { handled: [] };
        const command = new OpenAddOnDetailCommand("plugin:/work/x");

        routePreviewCommand(TABLE, command, session);

        expect([session.handled, debug.mock.calls]).toEqual([
            [],
            [["[DEBUG] OpenAddOnDetailCommand ignored: the test has no tab to open", command]],
        ]);
    });

    it("returns the row of a command type", () => {
        expect(previewRouteOf(TABLE, "OpenAddOnDetailCommand")).toEqual({
            ignored: "the test has no tab to open",
        });
    });

    it.each(["SomeOtherCommand", "toString", "constructor", "hasOwnProperty"])(
        "rejects a command type without a row of its own: %s",
        (type) => {
            expect(() => routePreviewCommand(TABLE, { type } as never, { handled: [] })).toThrow(
                `Unknown message type: ${type}`,
            );
        },
    );

    it("routes a command whose row reads it", () => {
        const session: TestSession = { handled: [] };

        routePreviewCommand(TABLE, new GetAddOnCatalogCommand(), session);

        expect(session.handled).toEqual(["GetAddOnCatalogCommand"]);
    });
});
