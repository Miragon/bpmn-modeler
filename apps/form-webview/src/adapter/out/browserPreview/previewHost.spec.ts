import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    DocumentFlushedCommand,
    type FormEditorCommand,
    type FormEditorCommandType,
    GetBpmnFileCommand,
    GetFormFileCommand,
    GetFormInputValuesCommand,
    LanguageQuery,
    LogErrorCommand,
    LogWarningCommand,
    type MessageOfType,
    type Query,
    SyncDocumentCommand,
    UpdateFormOutputValuesCommand,
    previewRouteOf,
} from "@miragon/bpmn-modeler-shared";

import { PREVIEW_COMMANDS } from "./previewCommands";
import { PreviewHost } from "./previewHost";

type Reply = { type: string } & Record<string, unknown>;

// Keyed by the closed list, so a command added to it cannot skip the preview checks below.
const FORM_COMMANDS_BY_TYPE: { [Type in FormEditorCommandType]: MessageOfType<Type> } = {
    SyncDocumentCommand: new SyncDocumentCommand("{}", 1),
    DocumentFlushedCommand: new DocumentFlushedCommand(1),
    LogWarningCommand: new LogWarningCommand("careful"),
    LogErrorCommand: new LogErrorCommand("broken"),
    GetFormFileCommand: new GetFormFileCommand(),
    GetFormInputValuesCommand: new GetFormInputValuesCommand(),
    UpdateFormOutputValuesCommand: new UpdateFormOutputValuesCommand("{}"),
};
const FORM_COMMANDS: readonly FormEditorCommand[] = Object.values(FORM_COMMANDS_BY_TYPE);

describe("PreviewHost", () => {
    let replies: Reply[];
    const collectReply = (event: MessageEvent<Reply>) => replies.push(event.data);

    beforeEach(() => {
        replies = [];
        window.addEventListener("message", collectReply);
    });

    afterEach(() => {
        window.removeEventListener("message", collectReply);
        vi.restoreAllMocks();
    });

    it("serves an empty Camunda 8 form as the opened document", () => {
        new PreviewHost().postMessage(new GetFormFileCommand());

        expect(replies).toHaveLength(1);
        expect(replies[0].type).toBe("FormFileQuery");
        expect(JSON.parse(replies[0].content as string)).toEqual({
            components: [],
            type: "default",
            id: "Form_1",
            executionPlatform: "Camunda Cloud",
            executionPlatformVersion: "8.8.0",
        });
    });

    it("serves empty input values for the preview", () => {
        new PreviewHost().postMessage(new GetFormInputValuesCommand());

        expect(replies).toEqual([
            expect.objectContaining({ type: "FormInputValuesQuery", content: "{}" }),
        ]);
    });

    it.each(
        FORM_COMMANDS.filter(
            (command) =>
                !["GetFormFileCommand", "GetFormInputValuesCommand"].includes(command.type),
        ),
    )("sends nothing back for a $type", (command) => {
        vi.spyOn(console, "debug").mockImplementation(() => undefined);
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        new PreviewHost().postMessage(command);

        expect(replies).toEqual([]);
    });

    it.each(
        FORM_COMMANDS.flatMap((command) => {
            const route = previewRouteOf(PREVIEW_COMMANDS, command.type);
            return "ignored" in route ? [{ command, reason: route.ignored }] : [];
        }),
    )("says why it drops a $command.type", ({ command, reason }) => {
        const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

        new PreviewHost().postMessage(command);

        expect(debug).toHaveBeenCalledWith(expect.stringContaining(reason), command);
    });

    it.each<[FormEditorCommand, "warn" | "error"]>([
        [new LogWarningCommand("careful"), "warn"],
        [new LogErrorCommand("broken"), "error"],
    ])("writes a $type to the console at its level", (command, level) => {
        const log = vi.spyOn(console, level).mockImplementation(() => undefined);

        new PreviewHost().postMessage(command);

        expect(log).toHaveBeenCalledWith((command as LogWarningCommand).message);
    });

    it("logs a caught error's stack under its message", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

        new PreviewHost().postMessage(new LogErrorCommand("Could not render", "Error: boom\n    at render"));

        expect(error).toHaveBeenCalledWith("Could not render\nError: boom\n    at render");
    });

    it.each(["toString", "constructor", "hasOwnProperty"])(
        "rejects a message whose type names the inherited %s",
        (type) => {
            const host = new PreviewHost();

            // @ts-expect-error No command has this type.
            expect(() => host.postMessage({ type })).toThrow(`Unknown message type: ${type}`);
        },
    );

    it("rejects a query, which only the host sends", () => {
        const host = new PreviewHost();
        const query: Query = new LanguageQuery("de");

        // @ts-expect-error The webview's channel takes no query.
        expect(() => host.postMessage(query)).toThrow("Unknown message type: LanguageQuery");
    });

    it("rejects a command of another surface", () => {
        const host = new PreviewHost();

        // @ts-expect-error The Form editor's channel takes no BPMN editor command.
        expect(() => host.postMessage(new GetBpmnFileCommand())).toThrow(
            "Unknown message type: GetBpmnFileCommand",
        );
    });
});
