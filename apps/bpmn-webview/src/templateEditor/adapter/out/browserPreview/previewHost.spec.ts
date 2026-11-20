import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    DocumentFlushedCommand,
    ElementTemplateFileQuery,
    GetBpmnFileCommand,
    GetElementTemplateFileCommand,
    LanguageQuery,
    LogDebugCommand,
    LogErrorCommand,
    LogInfoCommand,
    LogWarningCommand,
    type MessageOfType,
    type Query,
    SyncDocumentCommand,
    type TemplateEditorCommand,
    type TemplateEditorCommandType,
    previewRouteOf,
} from "@miragon/bpmn-modeler-shared";

import c7Samples from "../../../../__fixtures__/c7-samples.json";
import c8Samples from "../../../../__fixtures__/c8-samples.json";
import { PREVIEW_COMMANDS } from "./previewCommands";
import { PreviewHost } from "./previewHost";

// Keyed by the closed list, so a command added to it cannot skip the preview checks below.
const TEMPLATE_EDITOR_COMMANDS_BY_TYPE: {
    [Type in TemplateEditorCommandType]: MessageOfType<Type>;
} = {
    GetElementTemplateFileCommand: new GetElementTemplateFileCommand(),
    SyncDocumentCommand: new SyncDocumentCommand("[]", 1),
    DocumentFlushedCommand: new DocumentFlushedCommand(1),
    LogDebugCommand: new LogDebugCommand("debug"),
    LogInfoCommand: new LogInfoCommand("info"),
    LogWarningCommand: new LogWarningCommand("warning"),
    LogErrorCommand: new LogErrorCommand("error"),
};
const TEMPLATE_EDITOR_COMMANDS: readonly TemplateEditorCommand[] = Object.values(
    TEMPLATE_EDITOR_COMMANDS_BY_TYPE,
);

describe("PreviewHost", () => {
    let replies: Query[];
    const collectReply = (event: MessageEvent<Query>) => replies.push(event.data);

    beforeEach(() => {
        replies = [];
        window.addEventListener("message", collectReply);
    });

    afterEach(() => {
        window.removeEventListener("message", collectReply);
        window.history.replaceState({}, "", "/");
        vi.restoreAllMocks();
    });

    it("serves the C8 samples", () => {
        new PreviewHost().postMessage(new GetElementTemplateFileCommand());

        expect(replies).toEqual([
            new ElementTemplateFileQuery(`${JSON.stringify(c8Samples, null, 2)}\n`),
        ]);
    });

    it("serves the C7 samples and switches the language on request", () => {
        window.history.replaceState({}, "", "/?engine=c7&lang=de");

        new PreviewHost().postMessage(new GetElementTemplateFileCommand());

        expect(replies).toEqual([
            new ElementTemplateFileQuery(`${JSON.stringify(c7Samples, null, 2)}\n`),
            new LanguageQuery("de"),
        ]);
    });

    it("serves the C8 samples for an engine it does not know", () => {
        window.history.replaceState({}, "", "/?engine=toString");

        new PreviewHost().postMessage(new GetElementTemplateFileCommand());

        expect(replies).toEqual([
            new ElementTemplateFileQuery(`${JSON.stringify(c8Samples, null, 2)}\n`),
        ]);
    });

    it.each([
        ["empty", ""],
        ["broken", '{\n  "name": "Broken",\n'],
        ["notemplate", "[]\n"],
    ])("serves the %s file for the editor's other states", (file, content) => {
        window.history.replaceState({}, "", `/?file=${file}`);

        new PreviewHost().postMessage(new GetElementTemplateFileCommand());

        expect(replies).toEqual([new ElementTemplateFileQuery(content)]);
    });

    it.each([
        ["noschema", "Plain"],
        ["problems", "Problems"],
        ["unshaped", "Unshaped"],
        ["process", "Process"],
    ])("serves the %s file as JSON naming %s", (file, name) => {
        window.history.replaceState({}, "", `/?file=${file}`);

        new PreviewHost().postMessage(new GetElementTemplateFileCommand());

        const [reply] = replies as ElementTemplateFileQuery[];
        expect(reply.content.endsWith("\n")).toBe(true);
        expect([JSON.parse(reply.content)].flat()[0]).toEqual(expect.objectContaining({ name }));
    });

    it.each(
        TEMPLATE_EDITOR_COMMANDS.filter(
            (command) => command.type !== "GetElementTemplateFileCommand",
        ),
    )("sends nothing back for a $type", (command) => {
        for (const level of ["debug", "info", "warn", "error"] as const) {
            vi.spyOn(console, level).mockImplementation(() => undefined);
        }

        new PreviewHost().postMessage(command);

        expect(replies).toEqual([]);
    });

    it.each(
        TEMPLATE_EDITOR_COMMANDS.flatMap((command) => {
            const route = previewRouteOf(PREVIEW_COMMANDS, command.type);
            return "ignored" in route ? [{ command, reason: route.ignored }] : [];
        }),
    )("says why it drops a $command.type", ({ command, reason }) => {
        const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

        new PreviewHost().postMessage(command);

        expect(reason.trim()).not.toBe("");
        expect(debug).toHaveBeenCalledWith(`[DEBUG] ${command.type} ignored: ${reason}`, command);
    });

    it.each([
        [new LogDebugCommand("debug"), "debug"],
        [new LogInfoCommand("info"), "info"],
        [new LogWarningCommand("warning"), "warn"],
        [new LogErrorCommand("error"), "error"],
    ] as const)("writes a $type to the console at its level", (command, level) => {
        const log = vi.spyOn(console, level).mockImplementation(() => undefined);

        new PreviewHost().postMessage(command);

        expect(log).toHaveBeenCalledWith(command.message);
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

        // @ts-expect-error The template editor's channel takes no query.
        expect(() => host.postMessage(query)).toThrow("Unknown message type: LanguageQuery");
    });

    it("rejects a command of another surface", () => {
        const host = new PreviewHost();

        // @ts-expect-error The template editor's channel takes no BPMN editor command.
        expect(() => host.postMessage(new GetBpmnFileCommand())).toThrow(
            "Unknown message type: GetBpmnFileCommand",
        );
    });
});
