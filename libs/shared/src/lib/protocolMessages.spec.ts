import { describe, expect, it } from "vitest";

import * as addOnsViewMessages from "./addOnsView";
import * as baseMessages from "./messages";
import {
    Command,
    DocumentFlushedCommand,
    LogErrorCommand,
    LogMessageCommand,
    Query,
    SyncDocumentCommand,
} from "./messages";
import * as modelerMessages from "./modeler";

type MessageClass = new (...args: never[]) => { type: string };

const abstractMessageClasses: unknown[] = [Query, Command, LogMessageCommand];

const concreteMessageClasses = Object.entries<unknown>({
    ...baseMessages,
    ...modelerMessages,
    ...addOnsViewMessages,
}).filter(
    (entry): entry is [string, MessageClass] =>
        typeof entry[1] === "function" && !abstractMessageClasses.includes(entry[1]),
);

/**
 * Every host (VS Code, the modeler bridge, the IntelliJ Kotlin router) and the
 * webviews dispatch on hard-coded `type` literals spelled like the class name,
 * so a drifted literal silently routes a message to no handler at all.
 */
describe("protocol messages", () => {
    it("collects the message classes of every protocol module", () => {
        const names = concreteMessageClasses.map(([name]) => name);

        expect(names).toContain("SyncDocumentCommand");
        expect(names).toContain("ApplyDiffHighlightsQuery");
        expect(names).toEqual(
            expect.arrayContaining([
                "GetAddOnCatalogCommand",
                "AddOnRequestCommand",
                "AddOnCatalogQuery",
                "AddOnActionResultQuery",
                "RevealAddOnsQuery",
                "BrandModeQuery",
            ]),
        );
    });

    it.each(concreteMessageClasses)("%s carries its class name as type over JSON", (name, Cls) => {
        const message = Reflect.construct(Cls, []) as { type: string };

        expect(message.type).toBe(name);
        expect(JSON.parse(JSON.stringify(message)).type).toBe(name);
    });

    it("serializes document sync messages to the compact markers the IntelliJ host matches", () => {
        expect(JSON.stringify(new SyncDocumentCommand("<x/>"))).toContain(
            '"type":"SyncDocumentCommand"',
        );
        expect(JSON.stringify(new DocumentFlushedCommand(1, "<x/>"))).toContain(
            '"type":"DocumentFlushedCommand"',
        );
    });
});

describe("DocumentFlushedCommand", () => {
    it("reports a clean host buffer when no content was exported", () => {
        expect(new DocumentFlushedCommand(1).status).toBe("clean");
    });

    it("reports a flush when content was exported", () => {
        expect(new DocumentFlushedCommand(1, "<x/>").status).toBe("flushed");
    });

    it("keeps an explicit status over the content-derived default", () => {
        expect(new DocumentFlushedCommand(1, "<x/>", "host-updated", 3)).toMatchObject({
            status: "host-updated",
            documentRevision: 3,
        });
    });
});

describe("BpmnModelerSettingQuery", () => {
    const setting = {
        alignToOrigin: true,
        showTransactionBoundaries: false,
        colorTheme: "light" as const,
        favouriteBpmnElements: [],
    };

    it("enables automatic form previews when the host omits the preference", () => {
        const query = new modelerMessages.BpmnModelerSettingQuery(setting);

        expect(query.formPreviewAutomatic).toBe(true);
        expect(JSON.parse(JSON.stringify(query)).formPreviewAutomatic).toBe(true);
    });

    it("preserves an explicit automatic form preview opt-out over JSON", () => {
        const query = new modelerMessages.BpmnModelerSettingQuery(setting, false);

        expect(query.formPreviewAutomatic).toBe(false);
        expect(JSON.parse(JSON.stringify(query)).formPreviewAutomatic).toBe(false);
    });
});

describe("LogErrorCommand", () => {
    it("keeps message and stack through postMessage JSON serialization", () => {
        const command = new LogErrorCommand("import failed", "Error: boom\n    at main.ts:1");

        expect(JSON.parse(JSON.stringify(command))).toEqual({
            type: "LogErrorCommand",
            message: "import failed",
            stack: "Error: boom\n    at main.ts:1",
        });
    });
});
