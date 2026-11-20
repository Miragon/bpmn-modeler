import { afterEach, describe, expect, it, vi } from "vitest";

import { GetAddOnCatalogCommand, OpenAddOnDetailCommand } from "./addOnsView";
import { LogInfoCommand } from "./messages";
import {
    type PreviewCommandTable,
    previewRouteOf,
    routePreviewCommand,
} from "./previewCommandTable";

type TestType = "LogInfoCommand" | "GetAddOnCatalogCommand" | "OpenAddOnDetailCommand";

interface TestSession {
    readonly handled: string[];
}

const TABLE: PreviewCommandTable<TestType, TestSession> = {
    LogInfoCommand: ({ message }, session) => session.handled.push(message),
    GetAddOnCatalogCommand: ({ type }, session) => session.handled.push(type),
    OpenAddOnDetailCommand: { ignored: "the test has no tab to open" },
};

describe("a browser preview's command table", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("hands a command to its row together with the session", () => {
        const session: TestSession = { handled: [] };

        routePreviewCommand(TABLE, new LogInfoCommand("hello"), session, "[test preview]");

        expect(session.handled).toEqual(["hello"]);
    });

    it("drops a command whose row gives a reason, and logs the reason under the preview's prefix", () => {
        const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
        const session: TestSession = { handled: [] };
        const command = new OpenAddOnDetailCommand("plugin:/work/x");

        routePreviewCommand(TABLE, command, session, "[test preview]");

        expect([session.handled, debug.mock.calls]).toEqual([
            [],
            [
                [
                    "[test preview] OpenAddOnDetailCommand ignored: the test has no tab to open",
                    command,
                ],
            ],
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
            expect(() =>
                routePreviewCommand(TABLE, { type } as never, { handled: [] }, "[test preview]"),
            ).toThrow(`Unknown message type: ${type}`);
        },
    );

    it("routes a command whose row reads it", () => {
        const session: TestSession = { handled: [] };

        routePreviewCommand(TABLE, new GetAddOnCatalogCommand(), session, "[test preview]");

        expect(session.handled).toEqual(["GetAddOnCatalogCommand"]);
    });
});
