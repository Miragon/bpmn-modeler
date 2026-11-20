import { afterEach, describe, expect, it, vi } from "vitest";

import {
    ElementTemplateFileQuery,
    GetElementTemplateFileCommand,
    HostApiImpl,
    LanguageQuery,
    LogInfoCommand,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import c7Samples from "../../../__fixtures__/c7-samples.json";
import c8Samples from "../../../__fixtures__/c8-samples.json";
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

        expect(replies).toEqual([
            new ElementTemplateFileQuery(`${JSON.stringify(c8Samples, null, 2)}\n`),
        ]);
    });

    it("serves the C7 samples and switches the language on request", () => {
        vi.stubEnv("NODE_ENV", "development");
        window.history.replaceState({}, "", "/?engine=c7&lang=de");
        const replies = captureReplies();

        getTemplateEditorHostApi().postMessage(new GetElementTemplateFileCommand());

        expect(replies).toEqual([
            new ElementTemplateFileQuery(`${JSON.stringify(c7Samples, null, 2)}\n`),
            new LanguageQuery("de"),
        ]);
    });

    it("serves the C8 samples for an engine it does not know", () => {
        vi.stubEnv("NODE_ENV", "development");
        window.history.replaceState({}, "", "/?engine=toString");
        const replies = captureReplies();

        getTemplateEditorHostApi().postMessage(new GetElementTemplateFileCommand());

        expect(replies).toEqual([
            new ElementTemplateFileQuery(`${JSON.stringify(c8Samples, null, 2)}\n`),
        ]);
    });

    it.each([
        ["empty", ""],
        ["broken", '{\n  "name": "Broken",\n'],
    ])("serves the %s file for the editor's other states", (file, content) => {
        vi.stubEnv("NODE_ENV", "development");
        window.history.replaceState({}, "", `/?file=${file}`);
        const replies = captureReplies();

        getTemplateEditorHostApi().postMessage(new GetElementTemplateFileCommand());

        expect(replies).toEqual([new ElementTemplateFileQuery(content)]);
    });

    it.each([
        ["noschema", "Plain", undefined],
        ["unshaped", "Unshaped", "bpmn:ServiceTask"],
        ["process", "Process", undefined],
    ])("serves the %s template file for the builder's other states", (file, name, elementType) => {
        vi.stubEnv("NODE_ENV", "development");
        window.history.replaceState({}, "", `/?file=${file}`);
        const replies = captureReplies();

        getTemplateEditorHostApi().postMessage(new GetElementTemplateFileCommand());

        const [reply] = replies as ElementTemplateFileQuery[];
        expect(reply.content.endsWith("}\n")).toBe(true);
        const template = JSON.parse(reply.content) as { name: string; elementType?: string };
        expect([template.name, template.elementType]).toEqual([name, elementType]);
    });

    it("serves no template for the notemplate file", () => {
        vi.stubEnv("NODE_ENV", "development");
        window.history.replaceState({}, "", "/?file=notemplate");
        const replies = captureReplies();

        getTemplateEditorHostApi().postMessage(new GetElementTemplateFileCommand());

        expect(replies).toEqual([new ElementTemplateFileQuery("[]\n")]);
    });

    it("serves templates with every finding of the builder's rules for the problems file", () => {
        vi.stubEnv("NODE_ENV", "development");
        window.history.replaceState({}, "", "/?file=problems");
        const replies = captureReplies();

        getTemplateEditorHostApi().postMessage(new GetElementTemplateFileCommand());

        const [reply] = replies as ElementTemplateFileQuery[];
        const templates = JSON.parse(reply.content) as { id: string; properties: unknown[] }[];
        expect(templates.map(({ id, properties }) => [id, properties.length])).toEqual([
            ["problems", 17],
            ["more-problems", 1],
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
