/**
 * The slice of the `vscode` module the composition features touch while they
 * register, for `vi.mock("vscode", () => import(".../vscodeCompositionFake"))`.
 * Every registration returns an inert disposable.
 */
import * as windowFake from "./vscodeWindowFake";

export * from "./vscodeWindowFake";

const disposable = { dispose: () => undefined };

export const ConfigurationTarget = { Global: 1 };

export class EventEmitter<T> {
    readonly event = (_listener: (value: T) => void) => disposable;

    fire(_value: T): void {
        return undefined;
    }

    dispose(): void {
        return undefined;
    }
}

export const workspace = {
    fs: {},
    workspaceFolders: [],
    getConfiguration: () => ({ get: () => undefined, update: () => Promise.resolve() }),
    onDidChangeConfiguration: () => disposable,
    onDidChangeTextDocument: () => disposable,
    onWillSaveTextDocument: () => disposable,
    registerFileSystemProvider: () => disposable,
    createFileSystemWatcher: () => ({
        onDidCreate: () => disposable,
        onDidChange: () => disposable,
        onDidDelete: () => disposable,
        dispose: () => undefined,
    }),
};

export const window = {
    ...windowFake.window,
    tabGroups: { all: [], onDidChangeTabs: () => disposable },
    onDidChangeActiveTextEditor: () => disposable,
    registerCustomEditorProvider: () => disposable,
    registerWebviewViewProvider: () => disposable,
};

export const commands = { ...windowFake.commands, registerCommand: () => disposable };

export const languages = {
    createDiagnosticCollection: () => ({
        set: () => undefined,
        delete: () => undefined,
        dispose: () => undefined,
    }),
};
