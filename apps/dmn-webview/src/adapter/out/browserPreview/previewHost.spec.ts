import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    CursorChangedCommand,
    DiffReadyCommand,
    type DmnDiffPaneCommand,
    type DmnDiffPaneCommandType,
    DmnDiffScrollChangedCommand,
    DmnDiffViewChangedCommand,
    type DmnEditorCommand,
    type DmnEditorCommandType,
    DocumentFlushedCommand,
    GetDmnFileCommand,
    GetDmnModelerSettingCommand,
    GetPropertiesPanelStateCommand,
    LogErrorCommand,
    LogWarningCommand,
    type MessageOfType,
    RequestFocusCommand,
    SetPropertiesPanelStateCommand,
    SwapCompareSidesCommand,
    SyncDocumentCommand,
    ViewportChangedCommand,
    previewRouteOf,
} from "@miragon/bpmn-modeler-shared";

import { SAMPLE_DECISION_XML } from "../../../__fixtures__/sampleDecision";
import { SHIPPING_AFTER_XML, SHIPPING_BEFORE_XML } from "../../../__fixtures__/shippingDiff";
import { DIFF_PANE_PREVIEW_COMMANDS } from "./diffPanePreviewCommands";
import { DiffPanePreviewHost } from "./diffPanePreviewHost";
import { PREVIEW_COMMANDS } from "./previewCommands";
import { PreviewHost } from "./previewHost";

type Reply = { type: string } & Record<string, unknown>;

// Keyed by the closed lists, so a command added to one cannot skip the preview checks below.
const EDITOR_COMMANDS_BY_TYPE: { [Type in DmnEditorCommandType]: MessageOfType<Type> } = {
    GetDmnFileCommand: new GetDmnFileCommand(),
    GetPropertiesPanelStateCommand: new GetPropertiesPanelStateCommand(),
    GetDmnModelerSettingCommand: new GetDmnModelerSettingCommand(),
    SetPropertiesPanelStateCommand: new SetPropertiesPanelStateCommand(false),
    RequestFocusCommand: new RequestFocusCommand(),
    SyncDocumentCommand: new SyncDocumentCommand("<definitions />", 1),
    DocumentFlushedCommand: new DocumentFlushedCommand(1),
    LogWarningCommand: new LogWarningCommand("careful"),
    LogErrorCommand: new LogErrorCommand("broken"),
};
const EDITOR_COMMANDS: readonly DmnEditorCommand[] = Object.values(EDITOR_COMMANDS_BY_TYPE);

const DIFF_PANE_COMMANDS_BY_TYPE: { [Type in DmnDiffPaneCommandType]: MessageOfType<Type> } = {
    GetDmnFileCommand: new GetDmnFileCommand(),
    DiffReadyCommand: new DiffReadyCommand(),
    LogErrorCommand: new LogErrorCommand("broken"),
    ViewportChangedCommand: new ViewportChangedCommand({ x: 0, y: 0, width: 800, height: 600 }),
    CursorChangedCommand: new CursorChangedCommand(0),
    SwapCompareSidesCommand: new SwapCompareSidesCommand(),
    DmnDiffViewChangedCommand: new DmnDiffViewChangedCommand(null),
    DmnDiffScrollChangedCommand: new DmnDiffScrollChangedCommand({ rule: "Rule_1", offset: 4, left: 0 }),
};
const DIFF_PANE_COMMANDS: readonly DmnDiffPaneCommand[] = Object.values(DIFF_PANE_COMMANDS_BY_TYPE);

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

describe("PreviewHost", () => {
    it.each<[DmnEditorCommand, Reply]>([
        [new GetDmnFileCommand(), { type: "DmnFileQuery", content: SAMPLE_DECISION_XML }],
        [new GetPropertiesPanelStateCommand(), { type: "PropertiesPanelStateQuery", visible: true }],
        [
            new GetDmnModelerSettingCommand(),
            { type: "DmnModelerSettingQuery", setting: { colorTheme: "automatic" } },
        ],
        [new RequestFocusCommand(), { type: "TakeFocusQuery" }],
    ])("answers a $type", (command, reply) => {
        new PreviewHost().postMessage(command);

        expect(replies).toEqual([expect.objectContaining(reply)]);
    });

    it.each(
        EDITOR_COMMANDS.flatMap((command) => {
            const route = previewRouteOf(PREVIEW_COMMANDS, command.type);
            return "ignored" in route ? [{ command, reason: route.ignored }] : [];
        }),
    )("says why it drops a $command.type and sends nothing back", ({ command, reason }) => {
        const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

        new PreviewHost().postMessage(command);

        expect(debug).toHaveBeenCalledWith(expect.stringContaining(reason), command);
        expect(replies).toEqual([]);
    });

    it.each<[DmnEditorCommand, "warn" | "error"]>([
        [new LogWarningCommand("careful"), "warn"],
        [new LogErrorCommand("broken"), "error"],
    ])("writes a $type to the console at its level", (command, level) => {
        const log = vi.spyOn(console, level).mockImplementation(() => undefined);

        new PreviewHost().postMessage(command);

        expect(log).toHaveBeenCalledWith((command as LogWarningCommand).message);
        expect(replies).toEqual([]);
    });

    it("rejects a command of another surface", () => {
        const host = new PreviewHost();

        // @ts-expect-error The editor's channel takes no diff pane command.
        expect(() => host.postMessage(new DiffReadyCommand())).toThrow(
            "Unknown message type: DiffReadyCommand",
        );
    });
});

describe("DiffPanePreviewHost", () => {
    it.each([
        ["before", SHIPPING_BEFORE_XML],
        ["after", SHIPPING_AFTER_XML],
    ] as const)("serves the %s side of the shipping change", (side, content) => {
        new DiffPanePreviewHost(side).postMessage(new GetDmnFileCommand());

        expect(replies).toEqual([expect.objectContaining({ type: "DmnFileQuery", content })]);
    });

    it("answers a DiffReadyCommand with the diff as its side shows it", async () => {
        new DiffPanePreviewHost("after").postMessage(new DiffReadyCommand());

        await vi.waitFor(() => expect(replies).toHaveLength(1), { timeout: 10_000 });
        expect(replies[0]).toEqual(
            expect.objectContaining({
                type: "ApplyDmnDiffHighlightsQuery",
                side: "after",
                origin: "compare-files",
                paneFilename: "shipping-v2.dmn",
            }),
        );
    });

    it.each(
        DIFF_PANE_COMMANDS.flatMap((command) => {
            const route = previewRouteOf(DIFF_PANE_PREVIEW_COMMANDS, command.type);
            return "ignored" in route ? [{ command, reason: route.ignored }] : [];
        }),
    )("says why it drops a $command.type and sends nothing back", ({ command, reason }) => {
        const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

        new DiffPanePreviewHost("before").postMessage(command);

        expect(debug).toHaveBeenCalledWith(expect.stringContaining(reason), command);
        expect(replies).toEqual([]);
    });

    it("writes a LogErrorCommand to the console", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

        new DiffPanePreviewHost("before").postMessage(new LogErrorCommand("broken"));

        expect(error).toHaveBeenCalledWith("broken");
        expect(replies).toEqual([]);
    });

    it("rejects a command of the editor's surface", () => {
        const host = new DiffPanePreviewHost("before");

        // @ts-expect-error The diff pane's channel takes no editor command.
        expect(() => host.postMessage(new RequestFocusCommand())).toThrow(
            "Unknown message type: RequestFocusCommand",
        );
    });
});
