import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const executeCommand = vi.fn();
const closeTabs = vi.fn();
const commandHandlers = new Map<string, (...args: unknown[]) => unknown>();

// Hoisted with the mock factory, which subscribes to these lists as it runs.
const vscode = vi.hoisted(() => ({
    activeTextEditor: undefined as unknown,
    tabGroups: [] as { tabs: { input: unknown }[]; activeTab?: { input: unknown } }[],
    activeTab: undefined as { input: unknown } | undefined,
    editorListeners: [] as ((editor: unknown) => void)[],
    documentListeners: [] as ((event: { document: unknown }) => void)[],
    workspaceFolders: undefined as { uri: unknown; name: string }[] | undefined,
    files: new Map<string, Uint8Array>(),
    directories: new Set<string>(),
    writeError: undefined as Error | undefined,
}));
const showInputBox = vi.fn();
const showWorkspaceFolderPick = vi.fn();
const showSaveDialog = vi.fn();
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
        Uri: {
            joinPath: (base: { path: string }, ...segments: string[]) =>
                uriOf([base.path, ...segments].join("/")),
        },
        window: {
            get activeTextEditor() {
                return vscode.activeTextEditor;
            },
            showInputBox: (...args: unknown[]) => showInputBox(...args),
            showWorkspaceFolderPick: (...args: unknown[]) => showWorkspaceFolderPick(...args),
            showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
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
            get workspaceFolders() {
                return vscode.workspaceFolders;
            },
            fs: {
                stat: async (uri: { path: string }) => {
                    if (!vscode.files.has(uri.path)) throw new Error(`ENOENT ${uri.path}`);
                    return { type: 1 };
                },
                createDirectory: async (uri: { path: string }) => {
                    vscode.directories.add(uri.path);
                },
                writeFile: async (uri: { path: string }, content: Uint8Array) => {
                    if (vscode.writeError) throw vscode.writeError;
                    vscode.files.set(uri.path, content);
                },
            },
        },
    };
});

import { TabInputCustom, TabInputText } from "vscode";

import { ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE } from "@miragon/bpmn-modeler-core";
import { InMemorySettings, RecordingNotifier } from "@miragon/bpmn-modeler-core/testing";

import {
    ElementTemplateEditorController,
    NEW_ELEMENT_TEMPLATE_CMD,
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

function register(settings = new InMemorySettings()) {
    notifier = new RecordingNotifier();
    new ElementTemplateEditorController(notifier, settings).register({
        subscriptions: [],
    } as never);
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
    vscode.workspaceFolders = undefined;
    vscode.files.clear();
    vscode.directories.clear();
    vscode.writeError = undefined;
    showInputBox.mockReset();
    showWorkspaceFolderPick.mockReset();
    showSaveDialog.mockReset();
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

        it("finds the template editor shown in another group while the active one lags", async () => {
            register();
            const uri = uriOf("/work/status.json");
            const editorTab = {
                input: new TabInputCustom(uri as never, ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE),
            };
            const jsonTab = { input: new TabInputText(uri as never) };
            vscode.activeTab = jsonTab;
            vscode.tabGroups = [
                { tabs: [editorTab], activeTab: editorTab },
                { tabs: [jsonTab], activeTab: jsonTab },
            ];

            await run(TOGGLE_ELEMENT_TEMPLATE_JSON_CMD);

            expect(closeTabs).toHaveBeenCalledWith([jsonTab]);
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

    describe("creating a template", () => {
        const WORK = { uri: uriOf("/work"), name: "work" };
        const TEMPLATES = "/work/.camunda/element-templates";

        /** Answers the input box as a user would; it only accepts a name its validation passes. */
        function typeName(name: string) {
            showInputBox.mockImplementation(
                async (options: { validateInput: (value: string) => Promise<unknown> }) =>
                    (await options.validateInput(name)) ? undefined : name,
            );
        }

        const validationOf = async (value: string) => {
            const [options] = showInputBox.mock.calls[0] as [
                { validateInput: (value: string) => Promise<string | undefined> },
            ];
            return options.validateInput(value);
        };

        it("writes an empty file into the config folder's element templates and opens it", async () => {
            vscode.workspaceFolders = [WORK];
            register();
            typeName("payment");

            await run(NEW_ELEMENT_TEMPLATE_CMD);

            expect(vscode.directories).toEqual(new Set([TEMPLATES]));
            expect([...vscode.files]).toEqual([[`${TEMPLATES}/payment.json`, new Uint8Array()]]);
            expect(executeCommand).toHaveBeenCalledWith(
                "vscode.openWith",
                expect.objectContaining({ path: `${TEMPLATES}/payment.json` }),
                ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
            );
        });

        it("names the folder of the configured config folder", async () => {
            vscode.workspaceFolders = [WORK];
            register(new InMemorySettings({ configFolder: "config/camunda" }));
            typeName("payment.json");

            await run(NEW_ELEMENT_TEMPLATE_CMD);

            expect([...vscode.files.keys()]).toEqual([
                "/work/config/camunda/element-templates/payment.json",
            ]);
            expect(showInputBox).toHaveBeenCalledWith(
                expect.objectContaining({
                    value: "new-template",
                    prompt: "The file goes into config/camunda/element-templates.",
                }),
            );
        });

        it("asks again for a name that is taken or not a file name", async () => {
            vscode.workspaceFolders = [WORK];
            vscode.files.set(`${TEMPLATES}/payment.json`, new Uint8Array([123, 125]));
            register();
            showInputBox.mockResolvedValue(undefined);

            await run(NEW_ELEMENT_TEMPLATE_CMD);

            expect(await validationOf("payment")).toBe(
                "payment.json already exists in .camunda/element-templates.",
            );
            expect(await validationOf("a/b")).toBe(
                'A file name cannot contain any of these characters: / \\ : * ? " < > |',
            );
            expect(await validationOf("refund")).toBeUndefined();
        });

        it("creates nothing when the name is dismissed", async () => {
            vscode.workspaceFolders = [WORK];
            register();
            showInputBox.mockResolvedValue(undefined);

            await run(NEW_ELEMENT_TEMPLATE_CMD);

            expect(vscode.directories.size + vscode.files.size).toBe(0);
            expect(executeCommand).not.toHaveBeenCalledWith(
                "vscode.openWith",
                expect.anything(),
                ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
            );
        });

        it("never overwrites a file created while the name was typed", async () => {
            vscode.workspaceFolders = [WORK];
            register();
            showInputBox.mockImplementation(async () => {
                vscode.files.set(`${TEMPLATES}/payment.json`, new Uint8Array([123, 125]));
                return "payment";
            });

            await run(NEW_ELEMENT_TEMPLATE_CMD);

            expect(vscode.files.get(`${TEMPLATES}/payment.json`)).toEqual(
                new Uint8Array([123, 125]),
            );
            expect(notifier.infos).toEqual([
                "payment.json already exists in .camunda/element-templates.",
            ]);
        });

        it("reports a file it cannot write and opens nothing", async () => {
            vscode.workspaceFolders = [WORK];
            vscode.writeError = new Error("EACCES: permission denied");
            register();
            typeName("payment");

            await run(NEW_ELEMENT_TEMPLATE_CMD);

            expect(notifier.loggedErrors).toEqual([vscode.writeError]);
            expect(notifier.errors).toEqual([
                expect.stringContaining("A problem occurred while creating the element template."),
            ]);
            expect(executeCommand).not.toHaveBeenCalledWith(
                "vscode.openWith",
                expect.anything(),
                ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
            );
        });

        it("asks for the workspace folder in a multi-root workspace", async () => {
            const other = { uri: uriOf("/other"), name: "other" };
            vscode.workspaceFolders = [WORK, other];
            showWorkspaceFolderPick.mockResolvedValue(other);
            register();
            typeName("payment");

            await run(NEW_ELEMENT_TEMPLATE_CMD);

            expect([...vscode.files.keys()]).toEqual([
                "/other/.camunda/element-templates/payment.json",
            ]);
        });

        it("creates nothing when the workspace folder pick is dismissed", async () => {
            vscode.workspaceFolders = [WORK, { uri: uriOf("/other"), name: "other" }];
            showWorkspaceFolderPick.mockResolvedValue(undefined);
            register();

            await run(NEW_ELEMENT_TEMPLATE_CMD);

            expect(showInputBox).not.toHaveBeenCalled();
            expect(vscode.files.size).toBe(0);
        });

        it("lets the user pick the file without a workspace folder", async () => {
            register();
            showSaveDialog.mockResolvedValue({
                ...uriOf("/home/me/mail"),
                with: ({ path }: { path: string }) => uriOf(path),
            });

            await run(NEW_ELEMENT_TEMPLATE_CMD);

            expect([...vscode.files.keys()]).toEqual(["/home/me/mail.json"]);
            expect(executeCommand).toHaveBeenCalledWith(
                "vscode.openWith",
                expect.objectContaining({ path: "/home/me/mail.json" }),
                ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
            );
        });

        it("creates nothing when the save dialog is dismissed", async () => {
            register();
            showSaveDialog.mockResolvedValue(undefined);

            await run(NEW_ELEMENT_TEMPLATE_CMD);

            expect(vscode.files.size).toBe(0);
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
