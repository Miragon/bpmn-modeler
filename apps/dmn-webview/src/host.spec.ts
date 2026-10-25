import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    GetDmnFileCommand,
    GetDmnModelerSettingCommand,
    GetPropertiesPanelStateCommand,
    HostApiImpl,
    LogDebugCommand,
    LogErrorCommand,
    LogInfoCommand,
    LogWarningCommand,
    MockHostApi,
    RequestFocusCommand,
    SetPropertiesPanelStateCommand,
    SyncDocumentCommand,
    type Command,
} from "@miragon/bpmn-modeler-shared";

import { getHostApi } from "./host";

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

    it.each<[Command, Reply]>([
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

    it.each<[string, Command]>([
        ["a properties-panel toggle", new SetPropertiesPanelStateCommand(false)],
        ["a document sync", new SyncDocumentCommand("<definitions />", 3)],
    ])("takes %s without throwing or replying", (_, command) => {
        vi.spyOn(console, "debug").mockImplementation(() => undefined);
        const host = previewHost();

        expect(() => host.postMessage(command)).not.toThrow();
        expect(replies).toEqual([]);
    });

    it.each([
        ["debug", new LogDebugCommand("debug entry")],
        ["info", new LogInfoCommand("info entry")],
        ["warn", new LogWarningCommand("warning entry")],
        ["error", new LogErrorCommand("error entry")],
    ] as const)("mirrors a forwarded log onto console.%s", (level, command) => {
        const consoleLevel = vi.spyOn(console, level).mockImplementation(() => undefined);

        previewHost().postMessage(command);

        expect(consoleLevel).toHaveBeenCalledWith(command.message);
    });

    it("rejects a message outside the protocol so drift stays visible", () => {
        const host = previewHost();

        expect(() => host.postMessage({ type: "NotAProtocolMessage" })).toThrow(
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
