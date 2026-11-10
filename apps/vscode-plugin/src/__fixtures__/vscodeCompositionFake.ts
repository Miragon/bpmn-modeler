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
    getConfiguration: () => ({
        get: () => undefined,
        inspect: () => undefined,
        update: () => Promise.resolve(),
    }),
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

const windowStateListeners = new Set<(state: { focused: boolean }) => void>();

/** Plays VS Code's window gaining or losing focus to every `onDidChangeWindowState` listener. */
export function changeWindowFocus(focused: boolean): void {
    windowStateListeners.forEach((listener) => listener({ focused }));
}

const viewProviders = new Map<string, { provider: unknown; options: unknown }>();

/** The webview view providers registered so far, by view id. */
export const registeredViewProviders: ReadonlyMap<string, { provider: unknown; options: unknown }> =
    viewProviders;

export const window = {
    ...windowFake.window,
    onDidChangeWindowState: (listener: (state: { focused: boolean }) => void) => {
        windowStateListeners.add(listener);
        return { dispose: () => windowStateListeners.delete(listener) };
    },
    tabGroups: { all: [], onDidChangeTabs: () => disposable },
    onDidChangeActiveTextEditor: () => disposable,
    registerCustomEditorProvider: () => disposable,
    registerWebviewViewProvider: (viewId: string, provider: unknown, options?: unknown) => {
        viewProviders.set(viewId, { provider, options });
        return { dispose: () => viewProviders.delete(viewId) };
    },
};

export const commands = { ...windowFake.commands, registerCommand: () => disposable };

export const languages = {
    createDiagnosticCollection: () => ({
        set: () => undefined,
        delete: () => undefined,
        dispose: () => undefined,
    }),
};
