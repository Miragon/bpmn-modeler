import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    GetFormFileCommand,
    GetFormInputValuesCommand,
    HostApiImpl,
    MockHostApi,
    RequestFocusCommand,
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
        const command = new GetFormFileCommand();

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

    it("serves an empty Camunda 8 form as the opened document", () => {
        previewHost().postMessage(new GetFormFileCommand());

        expect(replies).toHaveLength(1);
        expect(replies[0].type).toBe("FormFileQuery");
        expect(JSON.parse(replies[0].content as string)).toEqual(
            expect.objectContaining({
                id: "Form_1",
                components: [],
                executionPlatform: "Camunda Cloud",
            }),
        );
    });

    it("serves empty input values for the preview", () => {
        previewHost().postMessage(new GetFormInputValuesCommand());

        expect(replies).toEqual([
            expect.objectContaining({ type: "FormInputValuesQuery", content: "{}" }),
        ]);
    });

    it("logs any other message without replying", () => {
        const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
        const command = new RequestFocusCommand();

        previewHost().postMessage(command);

        expect(replies).toEqual([]);
        expect(debug).toHaveBeenCalledWith("[FormWebview]", command);
    });
});
