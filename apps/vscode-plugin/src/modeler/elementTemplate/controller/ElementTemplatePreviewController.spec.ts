import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const executeCommand = vi.fn();
const commandHandlers = new Map<string, (...args: unknown[]) => unknown>();
const editorListeners: ((editor: unknown) => void)[] = [];
const documentListeners: ((event: { document: unknown }) => void)[] = [];

const vscode = vi.hoisted(() => ({ activeTextEditor: undefined as unknown }));

vi.mock("vscode", () => ({
    commands: {
        executeCommand: (...args: unknown[]) => executeCommand(...args),
        registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
            commandHandlers.set(id, handler);
            return { dispose: vi.fn() };
        },
    },
    ViewColumn: { Beside: -2 },
    window: {
        get activeTextEditor() {
            return vscode.activeTextEditor;
        },
        onDidChangeActiveTextEditor: (listener: (editor: unknown) => void) => {
            editorListeners.push(listener);
            return { dispose: vi.fn() };
        },
    },
    workspace: {
        onDidChangeTextDocument: (listener: (event: { document: unknown }) => void) => {
            documentListeners.push(listener);
            return { dispose: vi.fn() };
        },
    },
}));

import { ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE } from "@miragon/bpmn-modeler-core";
import { RecordingNotifier } from "@miragon/bpmn-modeler-core/testing";

import {
    ElementTemplatePreviewController,
    OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD,
} from "./ElementTemplatePreviewController";

const C8_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";

function editorOf(fileName: string, text: string) {
    const uri = { path: fileName };
    return { document: { uri, fileName, getText: () => text } };
}

const contextKeyValues = () =>
    executeCommand.mock.calls
        .filter(
            ([command, key]) =>
                command === "setContext" && key === "bpmn-modeler.isElementTemplate",
        )
        .map(([, , value]) => value);

let notifier: RecordingNotifier;

function register() {
    notifier = new RecordingNotifier();
    new ElementTemplatePreviewController(notifier).register({ subscriptions: [] } as never);
}

beforeEach(() => {
    vi.useFakeTimers();
    executeCommand.mockReset();
    commandHandlers.clear();
    editorListeners.length = 0;
    documentListeners.length = 0;
    vscode.activeTextEditor = undefined;
});

afterEach(() => {
    vi.useRealTimers();
});

describe("ElementTemplatePreviewController", () => {
    it("opens the preview beside the given file without taking focus", async () => {
        register();
        const uri = { path: "/work/status.json" };

        await commandHandlers.get(OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD)!(uri);

        expect(executeCommand).toHaveBeenCalledWith(
            "vscode.openWith",
            uri,
            ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE,
            { viewColumn: -2, preserveFocus: true },
        );
    });

    it("opens the preview of the active text editor when given no file", async () => {
        const editor = editorOf("/work/status.json", "{}");
        vscode.activeTextEditor = editor;
        register();

        await commandHandlers.get(OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD)!();

        expect(executeCommand).toHaveBeenCalledWith(
            "vscode.openWith",
            editor.document.uri,
            ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE,
            expect.anything(),
        );
    });

    it("explains that it needs a file", async () => {
        register();

        await commandHandlers.get(OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD)!();

        expect(notifier.infos).toEqual(["Open an element template file to preview it."]);
    });

    it("marks a JSON editor whose $schema names a template", () => {
        vscode.activeTextEditor = editorOf("/work/status.json", `{"$schema":"${C8_SCHEMA}"}`);
        register();

        editorListeners.forEach((listener) => listener(undefined));
        vscode.activeTextEditor = editorOf("/work/package.json", '{"name":"x"}');
        editorListeners.forEach((listener) => listener(undefined));
        vscode.activeTextEditor = editorOf("/work/notes.md", `"$schema":"${C8_SCHEMA}"`);
        editorListeners.forEach((listener) => listener(undefined));

        expect(contextKeyValues()).toEqual([true, true, false, false]);
    });

    it("rechecks the active document once typing pauses", () => {
        const editor = editorOf("/work/new.json", "{}");
        vscode.activeTextEditor = editor;
        register();

        editor.document.getText = () => `{"$schema":"${C8_SCHEMA}"}`;
        documentListeners.forEach((listener) => listener({ document: editor.document }));
        documentListeners.forEach((listener) =>
            listener({ document: { fileName: "/other.json" } }),
        );
        expect(contextKeyValues()).toEqual([false]);

        vi.advanceTimersByTime(300);
        expect(contextKeyValues()).toEqual([false, true]);
    });
});
