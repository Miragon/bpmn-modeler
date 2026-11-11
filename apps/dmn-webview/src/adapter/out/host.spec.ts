import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    GetDmnFileCommand,
    GetDmnModelerSettingCommand,
    GetPropertiesPanelStateCommand,
    HostApiImpl,
    LogErrorCommand,
    LogWarningCommand,
    MockHostApi,
    RequestFocusCommand,
    SetPropertiesPanelStateCommand,
    SyncDocumentCommand,
    type DmnEditorCommand,
} from "@miragon/bpmn-modeler-shared";

import {
    CursorChangedCommand,
    DiffReadyCommand,
    type DmnDiffPaneCommand,
} from "@miragon/bpmn-modeler-shared";

import { getDiffPaneHostApi, getHostApi, isDiffPane } from "./host";

type Reply = { type: string } & Record<string, unknown>;

describe("getHostApi", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("serves the in-browser mock only to the development preview", () => {
        vi.stubEnv("NODE_ENV", "development");

        const host = getHostApi();

        expect(host).toBeInstanceOf(MockHostApi);
        expect(host).not.toBeInstanceOf(HostApiImpl);
    });

    it("talks to the embedding host in every other build", () => {
        vi.stubEnv("NODE_ENV", "production");
        const vsCodeApi = { getState: vi.fn(), setState: vi.fn(), postMessage: vi.fn() };
        vi.stubGlobal("acquireVsCodeApi", () => vsCodeApi);
        const command = new GetDmnFileCommand();

        const host = getHostApi();
        host.postMessage(command);

        expect(host).toBeInstanceOf(HostApiImpl);
        expect(vsCodeApi.postMessage).toHaveBeenCalledWith(command);
    });
});

describe("development preview host", () => {
    let replies: Reply[];
    const collectReply = (event: MessageEvent<Reply>) => replies.push(event.data);

    function previewHost() {
        vi.stubEnv("NODE_ENV", "development");
        return getHostApi();
    }

    beforeEach(() => {
        replies = [];
        window.addEventListener("message", collectReply);
    });

    afterEach(() => {
        window.removeEventListener("message", collectReply);
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("serves the sample decision as the opened document", () => {
        previewHost().postMessage(new GetDmnFileCommand());

        expect(replies).toEqual([
            expect.objectContaining({
                type: "DmnFileQuery",
                content: expect.stringContaining('<decision id="decision_1"'),
            }),
        ]);
    });

    it.each<[DmnEditorCommand, Reply]>([
        [
            new GetPropertiesPanelStateCommand(),
            { type: "PropertiesPanelStateQuery", visible: true },
        ],
        [
            new GetDmnModelerSettingCommand(),
            { type: "DmnModelerSettingQuery", setting: { colorTheme: "automatic" } },
        ],
        [new RequestFocusCommand(), { type: "TakeFocusQuery" }],
    ])("answers %o with %o", (request, reply) => {
        previewHost().postMessage(request);

        expect(replies).toEqual([expect.objectContaining(reply)]);
    });

    it.each<[string, DmnEditorCommand]>([
        ["a properties-panel toggle", new SetPropertiesPanelStateCommand(false)],
        ["a document sync", new SyncDocumentCommand("<definitions />", 3)],
    ])("takes %s without throwing or replying", (_, command) => {
        vi.spyOn(console, "debug").mockImplementation(() => undefined);
        const host = previewHost();

        expect(() => host.postMessage(command)).not.toThrow();
        expect(replies).toEqual([]);
    });

    it.each([
        ["warn", new LogWarningCommand("warning entry")],
        ["error", new LogErrorCommand("error entry")],
    ] as const)("mirrors a forwarded log onto console.%s", (level, command) => {
        const consoleLevel = vi.spyOn(console, level).mockImplementation(() => undefined);

        previewHost().postMessage(command);

        expect(consoleLevel).toHaveBeenCalledWith(command.message);
    });

    it("rejects a message outside the protocol so drift stays visible", () => {
        const host = previewHost();

        const outsideTheProtocol = { type: "NotAProtocolMessage" } as unknown as DmnEditorCommand;

        expect(() => host.postMessage(outsideTheProtocol)).toThrow(
            "Unknown message type NotAProtocolMessage",
        );
    });

    it("seeds the state on the first update and merges later ones", () => {
        vi.spyOn(console, "debug").mockImplementation(() => undefined);
        const host = previewHost();

        host.updateState({ panelVisible: false });
        host.updateState({ panelScroll: 40 });

        expect(host.getState()).toEqual({ panelVisible: false, panelScroll: 40 });
    });
});

describe("diff pane detection", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        delete document.body.dataset.surface;
        history.replaceState(null, "", "/");
    });

    it("reads the host's HTML naming the page a DMN diff pane", () => {
        vi.stubEnv("NODE_ENV", "production");
        expect(isDiffPane()).toBe(false);

        document.body.dataset.surface = "dmnDiffPane";

        expect(isDiffPane()).toBe(true);
    });

    it.each(["diff-before", "diff-after"])("opens the preview's %s mode as a diff pane", (mode) => {
        vi.stubEnv("NODE_ENV", "development");
        history.replaceState(null, "", `/?mode=${mode}`);

        expect(isDiffPane()).toBe(true);
    });

    it("ignores a preview mode outside the development build", () => {
        vi.stubEnv("NODE_ENV", "production");
        history.replaceState(null, "", "/?mode=diff-after");

        expect(isDiffPane()).toBe(false);
    });
});

describe("diff pane host", () => {
    let replies: Reply[];
    const collectReply = (event: MessageEvent<Reply>) => replies.push(event.data);

    beforeEach(() => {
        replies = [];
        window.addEventListener("message", collectReply);
    });

    afterEach(() => {
        window.removeEventListener("message", collectReply);
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        history.replaceState(null, "", "/");
    });

    it("talks to the embedding host outside the preview", () => {
        vi.stubEnv("NODE_ENV", "production");
        const vsCodeApi = { getState: vi.fn(), setState: vi.fn(), postMessage: vi.fn() };
        vi.stubGlobal("acquireVsCodeApi", () => vsCodeApi);

        expect(getDiffPaneHostApi()).toBeInstanceOf(HostApiImpl);
    });

    it.each([
        ["diff-before", "before", "Legacy surcharge", "shipping-v1.dmn"],
        ["diff-after", "after", "Insured shipping", "shipping-v2.dmn"],
    ])("serves the %s side of the shipping change with its real diff", async (mode, side, name, file) => {
        vi.stubEnv("NODE_ENV", "development");
        history.replaceState(null, "", `/?mode=${mode}`);
        const host = getDiffPaneHostApi();

        host.postMessage(new GetDmnFileCommand());
        host.postMessage(new DiffReadyCommand());
        await vi.waitFor(() => expect(replies).toHaveLength(2));

        expect(replies[0]).toMatchObject({ type: "DmnFileQuery", content: expect.stringContaining(name) });
        expect(replies[1]).toMatchObject({
            type: "ApplyDmnDiffHighlightsQuery",
            side,
            origin: "compare-files",
            paneFilename: file,
            view: { changed: ["Decision_Shipping"] },
        });
    });

    it("logs a pane's error and has no partner to forward a sync to", () => {
        vi.stubEnv("NODE_ENV", "development");
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
        const host = getDiffPaneHostApi();

        host.postMessage(new LogErrorCommand("import failed") as DmnDiffPaneCommand);
        host.postMessage(new CursorChangedCommand(1));

        expect(error).toHaveBeenCalledWith("import failed");
        expect(debug).toHaveBeenCalledWith("[dev] CursorChangedCommand");
        expect(replies).toEqual([]);
    });
});
