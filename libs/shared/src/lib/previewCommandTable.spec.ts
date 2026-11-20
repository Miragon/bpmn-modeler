import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GetAddOnCatalogCommand, OpenAddOnDetailCommand } from "./addOnsView";
import { LogInfoCommand, TakeFocusQuery } from "./messages";
import {
    type PreviewCommandTable,
    previewRouteOf,
    replyToWebview,
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

const REPO_ROOT = join(__dirname, "../../../..");

function previewCommandTableFiles(): string[] {
    const appsDir = join(REPO_ROOT, "apps");
    return readdirSync(appsDir).flatMap((app) => {
        const previewDir = join(appsDir, app, "src/adapter/out/browserPreview");
        let entries: string[];
        try {
            entries = readdirSync(previewDir);
        } catch {
            return [];
        }
        return entries
            .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".spec.ts"))
            .map((entry) => join(previewDir, entry))
            .filter((file) => readFileSync(file, "utf8").includes("PreviewCommandTable<"));
    });
}

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

    // Rollup keeps a module-level statement holding an interpolated template literal, so a table would ship in production.
    it("finds every webview's table written with plain-string drop reasons, which leaves it out of the production bundle", () => {
        const tables = previewCommandTableFiles();

        expect(tables).not.toEqual([]);
        expect(tables.filter((file) => /ignored:\s*`/.test(readFileSync(file, "utf8")))).toEqual(
            [],
        );
    });
});

describe("a browser preview's reply", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function receivedReplies(): unknown[] {
        const received: unknown[] = [];
        const webview = new EventTarget();
        webview.addEventListener("message", (event) => received.push((event as MessageEvent).data));
        vi.stubGlobal("window", webview);
        return received;
    }

    it("reaches the webview as a message from its host", () => {
        const received = receivedReplies();
        const query = new TakeFocusQuery();

        replyToWebview(query);

        expect(received).toEqual([query]);
    });

    it("sends nothing when a feature has no answer", () => {
        const received = receivedReplies();

        replyToWebview(undefined);

        expect(received).toEqual([]);
    });
});
