import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FormInputValuesQuery } from "@miragon/bpmn-modeler-shared";

const vscodeMocks = vi.hoisted(() => {
    class TestUri {
        constructor(
            readonly scheme: string,
            readonly authority: string,
            readonly path: string,
            readonly query = "",
        ) {}

        static parse(value: string): TestUri {
            const parsed = new URL(value);
            return new TestUri(
                parsed.protocol.slice(0, -1),
                parsed.host,
                parsed.pathname,
                parsed.search.slice(1),
            );
        }

        static from(parts: {
            scheme: string;
            authority?: string;
            path?: string;
            query?: string;
        }): TestUri {
            return new TestUri(
                parts.scheme,
                parts.authority ?? "",
                parts.path ?? "",
                parts.query ?? "",
            );
        }

        toString(): string {
            return `${this.scheme}://${this.authority}${this.path}${this.query ? `?${this.query}` : ""}`;
        }
    }

    class TestEventEmitter<T> {
        private readonly listeners: ((event: T) => void)[] = [];
        readonly event = (listener: (event: T) => void) => {
            this.listeners.push(listener);
            return { dispose: vi.fn() };
        };
        fire(event: T): void {
            this.listeners.forEach((listener) => listener(event));
        }
        dispose(): void {
            this.listeners.length = 0;
        }
    }

    class TestTabInputText {
        constructor(readonly uri: TestUri) {}
    }

    return {
        TestUri,
        TestEventEmitter,
        TestTabInputText,
        executeCommand: vi.fn(),
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        registerFileSystemProvider: vi.fn(() => ({ dispose: vi.fn() })),
        openTextDocument: vi.fn(),
        onDidChangeTextDocument: vi.fn(),
        onDidChangeTabs: vi.fn(),
        closeTab: vi.fn(),
        documentChangeListener: undefined as
            ((event: { document: TestDocument; contentChanges: unknown[] }) => void) | undefined,
        tabChangeListener: undefined as
            | ((event: {
                  opened: { input: unknown }[];
                  closed: { input: unknown }[];
                  changed: { input: unknown }[];
              }) => void)
            | undefined,
        openTabGroups: [] as { tabs: { input: unknown }[] }[],
        textDocuments: [] as (TestDocument & { isDirty?: boolean })[],
        activeTextEditor: undefined as { document: { uri: TestUri } } | undefined,
    };
});

type TestUri = InstanceType<typeof vscodeMocks.TestUri>;

interface TestDocument {
    uri: TestUri;
    getText(): string;
    save(): Promise<boolean>;
}

vi.mock("vscode", () => ({
    commands: {
        executeCommand: (...args: unknown[]) => vscodeMocks.executeCommand(...args),
        registerCommand: (...args: unknown[]) => vscodeMocks.registerCommand(...args),
    },
    Disposable: class {
        constructor(readonly callOnDispose: () => void) {}
        dispose(): void {
            this.callOnDispose();
        }
    },
    EventEmitter: vscodeMocks.TestEventEmitter,
    FileChangeType: { Changed: 1, Created: 2, Deleted: 3 },
    FileSystemError: {
        FileExists: (uri: TestUri) => new Error(`File exists: ${uri.toString()}`),
        FileIsADirectory: (uri: TestUri) => new Error(`File is a directory: ${uri.toString()}`),
        FileNotADirectory: (uri: TestUri) => new Error(`Not a directory: ${uri.toString()}`),
        FileNotFound: (uri: TestUri) => new Error(`File not found: ${uri.toString()}`),
        NoPermissions: (message: string) => new Error(message),
    },
    FileType: { File: 1, Directory: 2 },
    TabInputText: vscodeMocks.TestTabInputText,
    Uri: vscodeMocks.TestUri,
    ViewColumn: { Beside: -2 },
    window: {
        get activeTextEditor() {
            return vscodeMocks.activeTextEditor;
        },
        tabGroups: {
            get all() {
                return vscodeMocks.openTabGroups;
            },
            close: (...args: unknown[]) => vscodeMocks.closeTab(...args),
            onDidChangeTabs: (listener: typeof vscodeMocks.tabChangeListener) => {
                vscodeMocks.tabChangeListener = listener;
                vscodeMocks.onDidChangeTabs(listener);
                return { dispose: vi.fn() };
            },
        },
    },
    workspace: {
        get textDocuments() {
            return vscodeMocks.textDocuments;
        },
        registerFileSystemProvider: (...args: unknown[]) =>
            vscodeMocks.registerFileSystemProvider(...args),
        openTextDocument: (...args: unknown[]) => vscodeMocks.openTextDocument(...args),
        onDidChangeTextDocument: (listener: typeof vscodeMocks.documentChangeListener) => {
            vscodeMocks.documentChangeListener = listener;
            vscodeMocks.onDidChangeTextDocument(listener);
            return { dispose: vi.fn() };
        },
    },
}));

import { TabInputText } from "vscode";

import {
    FORM_INPUT_VALUES_SCHEME,
    FORM_OUTPUT_VALUES_SCHEME,
    FormValuesController,
    TOGGLE_FORM_INPUT_VALUES_CMD,
    TOGGLE_FORM_OUTPUT_VALUES_CMD,
} from "./FormValuesController";

const EDITOR_ID = "file:///workspace/order.form";

function setup() {
    const editorStore = {
        getActiveEditorId: vi.fn(() => EDITOR_ID),
        postMessage: vi.fn().mockResolvedValue(true),
    };
    const notifier = { logError: vi.fn() };
    const controller = new FormValuesController(editorStore as never, notifier as never);
    const context = { subscriptions: [] as { dispose(): unknown }[] };
    controller.register(context as never);
    controller.registerSession(EDITOR_ID);
    return { controller, editorStore, notifier, context };
}

function registeredProvider(call: number): {
    readFile(uri: TestUri): Uint8Array;
    writeFile(
        uri: TestUri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean },
    ): void;
    onDidChangeFile(listener: (events: { type: number; uri: TestUri }[]) => void): unknown;
} {
    return vscodeMocks.registerFileSystemProvider.mock.calls[call][1];
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vscodeMocks.documentChangeListener = undefined;
    vscodeMocks.tabChangeListener = undefined;
    vscodeMocks.openTabGroups = [];
    vscodeMocks.textDocuments = [];
    vscodeMocks.activeTextEditor = undefined;
    vscodeMocks.closeTab.mockResolvedValue(true);
    vscodeMocks.executeCommand.mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

describe("FormValuesController", () => {
    it("registers writable input and read-only output virtual file systems", () => {
        setup();

        expect(vscodeMocks.registerFileSystemProvider).toHaveBeenNthCalledWith(
            1,
            FORM_INPUT_VALUES_SCHEME,
            expect.any(Object),
            { isCaseSensitive: true },
        );
        expect(vscodeMocks.registerFileSystemProvider).toHaveBeenNthCalledWith(
            2,
            FORM_OUTPUT_VALUES_SCHEME,
            expect.any(Object),
            { isCaseSensitive: true, isReadonly: true },
        );
        expect(vscodeMocks.registerCommand).toHaveBeenCalledWith(
            TOGGLE_FORM_INPUT_VALUES_CMD,
            expect.any(Function),
            expect.any(FormValuesController),
        );
        expect(vscodeMocks.registerCommand).toHaveBeenCalledWith(
            TOGGLE_FORM_OUTPUT_VALUES_CMD,
            expect.any(Function),
            expect.any(FormValuesController),
        );

        const inputUri = vscodeMocks.TestUri.from({
            scheme: FORM_INPUT_VALUES_SCHEME,
            authority: "session",
            path: "/input.json",
        });
        const outputUri = vscodeMocks.TestUri.from({
            scheme: FORM_OUTPUT_VALUES_SCHEME,
            authority: "session",
            path: "/output.json",
        });
        expect(() =>
            registeredProvider(1).writeFile(outputUri, new TextEncoder().encode("{}"), {
                create: true,
                overwrite: true,
            }),
        ).toThrow();
        expect(() =>
            registeredProvider(0).writeFile(inputUri, new TextEncoder().encode("{}"), {
                create: false,
                overwrite: true,
            }),
        ).toThrow("File not found");
    });

    it("opens the input JSON in the standard editor beside the form", async () => {
        const { controller } = setup();
        vscodeMocks.openTextDocument.mockImplementation(async (uri: TestUri) => ({ uri }));

        await expect(controller.toggleInputValues()).resolves.toBe(true);

        const uri = vscodeMocks.openTextDocument.mock.calls[0][0] as TestUri;
        expect(uri.scheme).toBe(FORM_INPUT_VALUES_SCHEME);
        expect(uri.path).toBe("/order.input.json");
        expect(new TextDecoder().decode(registeredProvider(0).readFile(uri))).toBe("{}");
        expect(vscodeMocks.executeCommand).toHaveBeenCalledWith(
            "vscode.openWith",
            uri,
            "default",
            -2,
        );
    });

    it("applies each valid input object to the active form and saves only in memory", async () => {
        const { controller, editorStore } = setup();
        vscodeMocks.openTextDocument.mockImplementation(async (uri: TestUri) => ({ uri }));
        await controller.toggleInputValues();
        const uri = vscodeMocks.openTextDocument.mock.calls[0][0] as TestUri;
        const save = vi.fn().mockResolvedValue(true);
        const document: TestDocument = {
            uri,
            getText: () => '{ "customer": { "name": "Ada" } }',
            save,
        };

        vscodeMocks.documentChangeListener?.({ document, contentChanges: [{}] });
        await vi.runAllTimersAsync();

        expect(editorStore.postMessage).toHaveBeenCalledWith(
            EDITOR_ID,
            new FormInputValuesQuery(JSON.stringify({ customer: { name: "Ada" } }, null, 2)),
        );
        expect(save).toHaveBeenCalledOnce();
    });

    it("keeps the last valid input while incomplete JSON is being edited", async () => {
        const { controller, editorStore } = setup();
        vscodeMocks.openTextDocument.mockImplementation(async (uri: TestUri) => ({ uri }));
        await controller.toggleInputValues();
        const uri = vscodeMocks.openTextDocument.mock.calls[0][0] as TestUri;
        const save = vi.fn().mockResolvedValue(true);

        vscodeMocks.documentChangeListener?.({
            document: { uri, getText: () => '{ "customer":', save },
            contentChanges: [{}],
        });
        await vi.runAllTimersAsync();

        expect(editorStore.postMessage).not.toHaveBeenCalled();
        expect(save).toHaveBeenCalledOnce();
    });

    it("debounces in-memory saves without delaying valid input updates", async () => {
        const { controller, editorStore } = setup();
        vscodeMocks.openTextDocument.mockImplementation(async (uri: TestUri) => ({ uri }));
        await controller.toggleInputValues();
        const uri = vscodeMocks.openTextDocument.mock.calls[0][0] as TestUri;
        let content = '{ "step": 1 }';
        const save = vi.fn().mockResolvedValue(true);
        const document = { uri, getText: () => content, save };

        vscodeMocks.documentChangeListener?.({ document, contentChanges: [{}] });
        content = '{ "step": 2 }';
        vscodeMocks.documentChangeListener?.({ document, contentChanges: [{}] });

        expect(editorStore.postMessage).toHaveBeenCalledTimes(2);
        expect(save).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
        expect(save).toHaveBeenCalledOnce();
    });

    it("refreshes an open read-only output document when form values change", () => {
        const { controller } = setup();
        const changed = vi.fn();
        registeredProvider(1).onDidChangeFile(changed);

        controller.updateOutputValues(
            EDITOR_ID,
            JSON.stringify({ approved: true, amount: 42 }, null, 2),
        );

        const event = changed.mock.calls[0][0][0] as { uri: TestUri };
        expect(event.uri.scheme).toBe(FORM_OUTPUT_VALUES_SCHEME);
        expect(new TextDecoder().decode(registeredProvider(1).readFile(event.uri))).toBe(
            JSON.stringify({ approved: true, amount: 42 }, null, 2),
        );
    });

    it("closes a virtual values tab on the second toggle", async () => {
        const { controller } = setup();
        vscodeMocks.openTextDocument.mockImplementation(async (uri: TestUri) => ({ uri }));
        await controller.toggleInputValues();
        const uri = vscodeMocks.openTextDocument.mock.calls[0][0] as TestUri;
        const tab = { input: new TabInputText(uri as never) };
        vscodeMocks.openTabGroups = [{ tabs: [tab] }];

        await expect(controller.toggleInputValues()).resolves.toBe(false);

        expect(vscodeMocks.closeTab).toHaveBeenCalledWith(tab);
        expect(vscodeMocks.openTextDocument).toHaveBeenCalledOnce();
    });

    it("retains backing data when a session tab cannot be closed", async () => {
        const { controller } = setup();
        vscodeMocks.openTextDocument.mockImplementation(async (uri: TestUri) => ({ uri }));
        await controller.toggleInputValues();
        const uri = vscodeMocks.openTextDocument.mock.calls[0][0] as TestUri;
        const tab = { input: new TabInputText(uri as never) };
        vscodeMocks.openTabGroups = [{ tabs: [tab] }];
        vscodeMocks.closeTab.mockResolvedValueOnce(false);

        await expect(controller.disposeSession(EDITOR_ID)).resolves.toBeUndefined();

        expect(new TextDecoder().decode(registeredProvider(0).readFile(uri))).toBe("{}");

        vscodeMocks.openTabGroups = [];
        vscodeMocks.tabChangeListener?.({ opened: [], closed: [tab], changed: [] });
        expect(() => registeredProvider(0).readFile(uri)).toThrow("File not found");
    });

    it("does not target another form from a retained values tab", async () => {
        const { controller, editorStore } = setup();
        vscodeMocks.openTextDocument.mockImplementation(async (uri: TestUri) => ({ uri }));
        await controller.toggleInputValues();
        const retainedUri = vscodeMocks.openTextDocument.mock.calls[0][0] as TestUri;
        vscodeMocks.openTabGroups = [{ tabs: [{ input: new TabInputText(retainedUri as never) }] }];
        vscodeMocks.closeTab.mockResolvedValueOnce(false);
        await controller.disposeSession(EDITOR_ID);
        controller.registerSession("file:///workspace/other.form");
        editorStore.getActiveEditorId.mockReturnValue("file:///workspace/other.form");
        vscodeMocks.activeTextEditor = { document: { uri: retainedUri } };

        await expect(controller.toggleOutputValues()).resolves.toBe(false);

        expect(vscodeMocks.openTextDocument).toHaveBeenCalledOnce();
    });

    it("closes restored values tabs that no longer belong to a form session", async () => {
        const uri = vscodeMocks.TestUri.from({
            scheme: FORM_INPUT_VALUES_SCHEME,
            authority: "old-session",
            path: "/order.input.json",
        });
        const tab = { input: new TabInputText(uri as never) };
        vscodeMocks.openTabGroups = [{ tabs: [tab] }];
        const controller = new FormValuesController(
            { getActiveEditorId: vi.fn(), postMessage: vi.fn() } as never,
            { logError: vi.fn() } as never,
        );

        controller.register({ subscriptions: [] } as never);
        await Promise.resolve();

        expect(vscodeMocks.closeTab).toHaveBeenCalledWith([tab]);
    });
});
