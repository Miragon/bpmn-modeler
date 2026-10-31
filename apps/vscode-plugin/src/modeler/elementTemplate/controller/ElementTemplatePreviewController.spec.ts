import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const executeCommand = vi.fn();
const commandHandlers = new Map<string, (...args: unknown[]) => unknown>();

// Hoisted with the mock factory, which subscribes to these lists as it runs.
const vscode = vi.hoisted(() => ({
    activeTextEditor: undefined as unknown,
    tabGroups: [] as { tabs: { input: unknown }[] }[],
    activeTab: undefined as { input: unknown } | undefined,
    editorListeners: [] as ((editor: unknown) => void)[],
    documentListeners: [] as ((event: { document: unknown }) => void)[],
    tabListeners: [] as ((event: { closed: { input: unknown }[] }) => void)[],
}));
const { editorListeners, documentListeners, tabListeners } = vscode;

vi.mock("vscode", () => {
    class TabInputText {
        constructor(readonly uri: unknown) {}
    }
    class TabInputTextDiff {
        constructor(
            readonly original: unknown,
            readonly modified: unknown,
        ) {}
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
        TabInputTextDiff,
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
                onDidChangeTabs: subscribe(vscode.tabListeners),
            },
        },
        workspace: {
            onDidChangeTextDocument: subscribe(vscode.documentListeners),
        },
    };
});

import { TabInputCustom, TabInputText, TabInputTextDiff } from "vscode";

import { ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE } from "@miragon/bpmn-modeler-core";
import { RecordingNotifier } from "@miragon/bpmn-modeler-core/testing";

import {
    ElementTemplatePreviewController,
    OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD,
} from "./ElementTemplatePreviewController";

const C8_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";
const TEMPLATE = `{"$schema":"${C8_SCHEMA}"}`;

function uriOf(path: string, scheme = "file") {
    return { scheme, path, toString: () => `${scheme}://${path}` };
}

function editorOf(
    fileName: string,
    text: string,
    overrides: { scheme?: string; viewColumn?: number | undefined } = {},
) {
    // `in`, not a default: an explicit `undefined` column is the case under test.
    const viewColumn = "viewColumn" in overrides ? overrides.viewColumn : 1;
    return {
        viewColumn,
        document: { uri: uriOf(fileName, overrides.scheme), fileName, getText: () => text },
    };
}

const contextKeyValues = () =>
    executeCommand.mock.calls
        .filter(
            ([command, key]) =>
                command === "setContext" && key === "bpmn-modeler.isElementTemplate",
        )
        .map(([, , value]) => value);

const openedPreviews = () =>
    executeCommand.mock.calls
        .filter(([command]) => command === "vscode.openWith")
        .map(([, uri]) => (uri as { path: string }).path);

const showEditor = (editor: unknown) => {
    vscode.activeTextEditor = editor;
    editorListeners.forEach((listener) => listener(editor));
};

let notifier: RecordingNotifier;

function register({ openAutomatically = true } = {}) {
    notifier = new RecordingNotifier();
    new ElementTemplatePreviewController(notifier, () => openAutomatically).register({
        subscriptions: [],
    } as never);
}

beforeEach(() => {
    vi.useFakeTimers();
    executeCommand.mockReset();
    commandHandlers.clear();
    editorListeners.length = 0;
    documentListeners.length = 0;
    tabListeners.length = 0;
    vscode.activeTextEditor = undefined;
    vscode.tabGroups = [];
    vscode.activeTab = undefined;
});

afterEach(() => {
    vi.useRealTimers();
});

describe("ElementTemplatePreviewController", () => {
    describe("the open command", () => {
        it("opens the preview beside the given file without taking focus", async () => {
            register();
            const uri = uriOf("/work/status.json");

            await commandHandlers.get(OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD)!(uri);

            expect(executeCommand).toHaveBeenCalledWith(
                "vscode.openWith",
                uri,
                ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE,
                { viewColumn: -2, preserveFocus: true },
            );
        });

        it("opens the preview of the active text editor when given no file", async () => {
            register();
            showEditor(editorOf("/work/plain.json", "{}"));

            await commandHandlers.get(OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD)!();

            expect(openedPreviews()).toEqual(["/work/plain.json"]);
        });

        it("explains that it needs a file", async () => {
            register();

            await commandHandlers.get(OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD)!();

            expect(notifier.infos).toEqual(["Open an element template file to preview it."]);
        });

        it("still works with automatic opening turned off", async () => {
            register({ openAutomatically: false });

            await commandHandlers.get(OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD)!(uriOf("/work/x.json"));

            expect(openedPreviews()).toEqual(["/work/x.json"]);
        });
    });

    describe("the editor title button", () => {
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

    describe("opening on its own", () => {
        it("opens the preview beside a template the first time it is shown", () => {
            const editor = editorOf("/work/status.json", TEMPLATE);
            vscode.activeTextEditor = editor;
            register();

            showEditor(editorOf("/work/package.json", "{}"));
            showEditor(editor);

            expect(openedPreviews()).toEqual(["/work/status.json"]);
            expect(executeCommand).toHaveBeenCalledWith(
                "vscode.openWith",
                editor.document.uri,
                ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE,
                { viewColumn: -2, preserveFocus: true },
            );
        });

        it("opens it for any JSON file in an element-templates folder, even an empty one", () => {
            register();

            showEditor(editorOf("/work/.camunda/element-templates/new.json", ""));

            expect(openedPreviews()).toEqual(["/work/.camunda/element-templates/new.json"]);
        });

        it("opens it once a template is pasted into the file", () => {
            const editor = editorOf("/work/scratch.json", "{}");
            register();
            showEditor(editor);

            editor.document.getText = () => TEMPLATE;
            documentListeners.forEach((listener) => listener({ document: editor.document }));
            vi.advanceTimersByTime(300);

            expect(openedPreviews()).toEqual(["/work/scratch.json"]);
        });

        it("keeps a closed preview closed until the file is opened again", () => {
            const editor = editorOf("/work/status.json", TEMPLATE);
            register();
            showEditor(editor);

            showEditor(editor);
            expect(openedPreviews()).toHaveLength(1);

            vscode.tabGroups = [
                { tabs: [{ input: new TabInputText(editor.document.uri as never) }] },
            ];
            tabListeners.forEach((listener) =>
                listener({ closed: [{ input: new TabInputText(editor.document.uri as never) }] }),
            );
            showEditor(editor);
            expect(openedPreviews()).toHaveLength(1);

            vscode.tabGroups = [];
            tabListeners.forEach((listener) =>
                listener({ closed: [{ input: new TabInputText(editor.document.uri as never) }] }),
            );
            showEditor(editor);
            expect(openedPreviews()).toHaveLength(2);
        });

        it("leaves other JSON files alone", () => {
            register();

            showEditor(editorOf("/work/package.json", '{"name":"x"}'));

            expect(openedPreviews()).toEqual([]);
        });

        it("stays off when the user turned it off", () => {
            register({ openAutomatically: false });

            showEditor(editorOf("/work/status.json", TEMPLATE));

            expect(openedPreviews()).toEqual([]);
        });

        it("does not add a second preview to a file that has one", () => {
            const editor = editorOf("/work/status.json", TEMPLATE);
            vscode.tabGroups = [
                {
                    tabs: [
                        {
                            input: new TabInputCustom(
                                editor.document.uri as never,
                                ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE,
                            ),
                        },
                    ],
                },
            ];
            register();

            showEditor(editor);

            expect(openedPreviews()).toEqual([]);
        });

        it.each([
            [
                "a diff",
                () => {
                    vscode.activeTab = {
                        input: new TabInputTextDiff(undefined as never, undefined as never),
                    };
                    return editorOf("/work/status.json", TEMPLATE);
                },
            ],
            ["a file from git", () => editorOf("/work/status.json", TEMPLATE, { scheme: "git" })],
            [
                "an editor outside the editor area",
                () => editorOf("/work/status.json", TEMPLATE, { viewColumn: undefined }),
            ],
        ])("does not open it for %s", (_, editorFor) => {
            register();

            showEditor(editorFor());

            expect(openedPreviews()).toEqual([]);
        });
    });
});
