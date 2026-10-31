import { afterEach, describe, expect, it, vi } from "vitest";

import {
    ElementTemplateFileQuery,
    GetElementTemplateFileCommand,
    HostApiImpl,
    LanguageQuery,
    LogInfoCommand,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import c7Samples from "../__fixtures__/c7-samples.json";
import c8Samples from "../__fixtures__/c8-samples.json";
import { getTemplateEditorHostApi } from "./host";

function captureReplies(): Query[] {
    const replies: Query[] = [];
    window.addEventListener("message", (event: MessageEvent<Query>) => replies.push(event.data));
    return replies;
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
});

describe("getTemplateEditorHostApi", () => {
    it("talks to the real host outside development", () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubGlobal("acquireVsCodeApi", () => ({ postMessage: vi.fn() }));

        expect(getTemplateEditorHostApi()).toBeInstanceOf(HostApiImpl);
    });

    it("serves the C8 samples in development", () => {
        vi.stubEnv("NODE_ENV", "development");
        const replies = captureReplies();

        getTemplateEditorHostApi().postMessage(new GetElementTemplateFileCommand());

        expect(replies).toEqual([new ElementTemplateFileQuery(JSON.stringify(c8Samples, null, 2))]);
    });

    it("serves the C7 samples and switches the language on request", () => {
        vi.stubEnv("NODE_ENV", "development");
        window.history.replaceState({}, "", "/?engine=c7&lang=de");
        const replies = captureReplies();

        getTemplateEditorHostApi().postMessage(new GetElementTemplateFileCommand());

        expect(replies).toEqual([
            new ElementTemplateFileQuery(JSON.stringify(c7Samples, null, 2)),
            new LanguageQuery("de"),
        ]);
    });

    it("only logs other commands", () => {
        vi.stubEnv("NODE_ENV", "development");
        const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
        const replies = captureReplies();

        getTemplateEditorHostApi().postMessage(new LogInfoCommand("hello"));

        expect(replies).toEqual([]);
        expect(debug).toHaveBeenCalled();
    });
});
