import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const executeCommand = vi.fn();
const closeTabs = vi.fn();
const commandHandlers = new Map<string, (...args: unknown[]) => unknown>();

// Hoisted with the mock factory, which subscribes to these lists as it runs.
const vscode = vi.hoisted(() => ({
    activeTextEditor: undefined as unknown,
    tabGroups: [] as { tabs: { input: unknown }[] }[],
    activeTab: undefined as { input: unknown } | undefined,
    editorListeners: [] as ((editor: unknown) => void)[],
    documentListeners: [] as ((event: { document: unknown }) => void)[],
}));
const { editorListeners, documentListeners } = vscode;

vi.mock("vscode", () => {
    class TabInputText {
        constructor(readonly uri: unknown) {}
    }
    class TabInputCustom {
        constructor(
            readonly uri: unknown,
            readonly viewType: string,
        ) {}
    }
    const subscribe =
        <T>(listeners: T[]) =>
        (listener: T) => {
            listeners.push(listener);
            return { dispose: vi.fn() };
        };
    return {
        commands: {
            executeCommand: (...args: unknown[]) => executeCommand(...args),
            registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
                commandHandlers.set(id, handler);
                return { dispose: vi.fn() };
            },
        },
        TabInputCustom,
        TabInputText,
        ViewColumn: { Beside: -2 },
        window: {
            get activeTextEditor() {
                return vscode.activeTextEditor;
            },
            onDidChangeActiveTextEditor: subscribe(vscode.editorListeners),
            tabGroups: {
                get all() {
                    return vscode.tabGroups;
                },
                get activeTabGroup() {
                    return { activeTab: vscode.activeTab };
                },
                close: (...args: unknown[]) => closeTabs(...args),
            },
        },
        workspace: {
            onDidChangeTextDocument: subscribe(vscode.documentListeners),
        },
    };
});

import { TabInputCustom, TabInputText } from "vscode";

import { ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE } from "@miragon/bpmn-modeler-core";
import { RecordingNotifier } from "@miragon/bpmn-modeler-core/testing";

import {
    ElementTemplateEditorController,
    OPEN_ELEMENT_TEMPLATE_EDITOR_CMD,
    TOGGLE_ELEMENT_TEMPLATE_JSON_CMD,
} from "./ElementTemplateEditorController";

const C8_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";
const TEMPLATE = `{"$schema":"${C8_SCHEMA}"}`;

function uriOf(path: string) {
    return { scheme: "file", path, toString: () => `file://${path}` };
}

function editorOf(fileName: string, text: string) {
    return { viewColumn: 1, document: { uri: uriOf(fileName), fileName, getText: () => text } };
}

const contextKeyValues = () =>
    executeCommand.mock.calls
        .filter(
            ([command, key]) =>
                command === "setContext" && key === "bpmn-modeler.isElementTemplate",
        )
        .map(([, , value]) => value);

const showEditor = (editor: unknown) => {
    vscode.activeTextEditor = editor;
    editorListeners.forEach((listener) => listener(editor));
};

let notifier: RecordingNotifier;

function register() {
    notifier = new RecordingNotifier();
    new ElementTemplateEditorController(notifier).register({ subscriptions: [] } as never);
}

const run = (command: string, ...args: unknown[]) => commandHandlers.get(command)!(...args);

beforeEach(() => {
    vi.useFakeTimers();
    executeCommand.mockReset();
    closeTabs.mockReset();
    commandHandlers.clear();
    editorListeners.length = 0;
    documentListeners.length = 0;
    vscode.activeTextEditor = undefined;
    vscode.tabGroups = [];
    vscode.activeTab = undefined;
});

afterEach(() => {
    vi.useRealTimers();
});

describe("ElementTemplateEditorController", () => {
    describe("opening a file in the editor", () => {
        it("opens the given file in the template editor", async () => {
            register();
            const uri = uriOf("/work/status.json");

            await run(OPEN_ELEMENT_TEMPLATE_EDITOR_CMD, uri);

            expect(executeCommand).toHaveBeenCalledWith(
                "vscode.openWith",
                uri,
                ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
            );
        });

        it("opens the active JSON editor's file when given none", async () => {
            register();
            const editor = editorOf("/work/plain.json", "{}");
            showEditor(editor);

            await run(OPEN_ELEMENT_TEMPLATE_EDITOR_CMD);

            expect(executeCommand).toHaveBeenCalledWith(
                "vscode.openWith",
                editor.document.uri,
                ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
            );
        });

        it("explains that it needs a file", async () => {
            register();

            await run(OPEN_ELEMENT_TEMPLATE_EDITOR_CMD);

            expect(notifier.infos).toEqual(["Open an element template file to edit it."]);
        });
    });

    describe("toggling the JSON", () => {
        it("shows the JSON beside the template editor", async () => {
            register();
            const uri = uriOf("/work/status.json");

            await run(TOGGLE_ELEMENT_TEMPLATE_JSON_CMD, uri);

            expect(executeCommand).toHaveBeenCalledWith("vscode.openWith", uri, "default", -2);
        });

        it("hides the JSON again when it is open", async () => {
            register();
            const uri = uriOf("/work/status.json");
            const jsonTab = { input: new TabInputText(uri as never) };
            vscode.tabGroups = [
                { tabs: [jsonTab, { input: new TabInputText(uriOf("/x") as never) }] },
            ];

            await run(TOGGLE_ELEMENT_TEMPLATE_JSON_CMD, uri);

            expect(closeTabs).toHaveBeenCalledWith([jsonTab]);
            expect(executeCommand).not.toHaveBeenCalledWith(
                "vscode.openWith",
                expect.anything(),
                "default",
                expect.anything(),
            );
        });

        it("toggles the JSON of the active template editor when given no file", async () => {
            register();
            const uri = uriOf("/work/status.json");
            vscode.activeTab = {
                input: new TabInputCustom(uri as never, ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE),
            };

            await run(TOGGLE_ELEMENT_TEMPLATE_JSON_CMD);

            expect(executeCommand).toHaveBeenCalledWith("vscode.openWith", uri, "default", -2);
        });

        it("does nothing without a template editor", async () => {
            register();
            vscode.activeTab = { input: new TabInputCustom(uriOf("/a.bpmn") as never, "other") };

            await run(TOGGLE_ELEMENT_TEMPLATE_JSON_CMD);

            expect(executeCommand).not.toHaveBeenCalledWith(
                "vscode.openWith",
                expect.anything(),
                "default",
                expect.anything(),
            );
        });
    });

    describe("the editor title button of a JSON editor", () => {
        it("marks the active editor while it holds a template", () => {
            vscode.activeTextEditor = editorOf("/work/status.json", TEMPLATE);
            register();

            showEditor(editorOf("/work/package.json", '{"name":"x"}'));
            showEditor(editorOf("/work/notes.md", TEMPLATE));

            expect(contextKeyValues()).toEqual([true, false, false]);
        });

        it("rechecks the active document once typing pauses", () => {
            const editor = editorOf("/work/new.json", "{}");
            vscode.activeTextEditor = editor;
            register();

            editor.document.getText = () => TEMPLATE;
            documentListeners.forEach((listener) => listener({ document: editor.document }));
            documentListeners.forEach((listener) =>
                listener({ document: { fileName: "/other.json" } }),
            );
            expect(contextKeyValues()).toEqual([false]);

            vi.advanceTimersByTime(300);
            expect(contextKeyValues()).toEqual([false, true]);
        });
    });
});
