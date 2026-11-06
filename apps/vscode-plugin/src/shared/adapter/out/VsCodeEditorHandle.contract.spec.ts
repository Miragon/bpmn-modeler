import { vi } from "vitest";
import type { TextDocument, WebviewPanel } from "vscode";

import { ModelerSettingsSnapshot, settingKeyOf } from "@miragon/bpmn-modeler-core";
import { describeEditorHandleContract } from "@miragon/bpmn-modeler-core/testing";

import { Uri } from "../../../__fixtures__/vscodeFileSystemFake";
import { VsCodeEditorHandle } from "./VsCodeEditorHandle";

type Listener = (event: unknown) => void;
type Subscribe = (listener: Listener) => { dispose(): void };

// The `workspace` events and edits of the fixture's VS Code, set per fixture.
const vscodeHost = vi.hoisted(() => {
    const unsubscribed: Subscribe = () => ({ dispose: () => undefined });
    return {
        applyEdit: (_edit: unknown): Promise<boolean> => Promise.resolve(false),
        onDidChangeTextDocument: unsubscribed,
        onDidChangeConfiguration: unsubscribed,
    };
});

vi.mock("vscode", () => ({
    workspace: {
        applyEdit: (edit: unknown) => vscodeHost.applyEdit(edit),
        fs: { isWritableFileSystem: () => true },
        onDidChangeTextDocument: (listener: Listener) => vscodeHost.onDidChangeTextDocument(listener),
        onDidChangeConfiguration: (listener: Listener) =>
            vscodeHost.onDidChangeConfiguration(listener),
    },
    WorkspaceEdit: class {
        readonly replacements: { range: FakeRange; text: string }[] = [];

        replace(_uri: unknown, range: FakeRange, text: string): void {
            this.replacements.push({ range, text });
        }
    },
    Range: class {
        constructor(
            readonly start: { offset: number },
            readonly end: { offset: number },
        ) {}
    },
}));

// `create` keeps the panel the bootstrap returns, which is the one VS Code handed over.
vi.mock("./bootstrapWebview", () => ({
    bootstrapWebview: (_viewType: string, panel: unknown) => panel,
}));

interface FakeRange {
    readonly start: { offset: number };
    readonly end: { offset: number };
}

/** VS Code's event: disposing a listener detaches it alone. */
class Emitter<T> {
    private listeners: { readonly listener: (event: T) => void }[] = [];

    readonly event = (listener: (event: T) => void) => {
        const entry = { listener };
        this.listeners.push(entry);
        return {
            dispose: () => {
                this.listeners = this.listeners.filter((registered) => registered !== entry);
            },
        };
    };

    fire(event: T): void {
        [...this.listeners].forEach(({ listener }) => listener(event));
    }
}

class FakeTextDocument {
    isDirty = false;

    constructor(
        readonly uri: Uri,
        private text: string,
    ) {}

    getText(): string {
        return this.text;
    }

    positionAt(offset: number): { offset: number } {
        return { offset };
    }

    async save(): Promise<boolean> {
        this.isDirty = false;
        return true;
    }

    replace(start: number, end: number, text: string): void {
        this.text = this.text.slice(0, start) + text + this.text.slice(end);
        this.isDirty = true;
    }
}

/** A custom editor's panel: VS Code opens it focused and fires a view state change only on a change. */
class FakeWebviewPanel {
    readonly options = { retainContextWhenHidden: false };
    active = true;
    visible = true;
    readonly posted: unknown[] = [];

    private disposed = false;
    private readonly disposals = new Emitter<void>();
    private readonly viewStates = new Emitter<unknown>();
    private readonly messages = new Emitter<unknown>();

    readonly onDidDispose = this.disposals.event;
    readonly onDidChangeViewState = this.viewStates.event;
    readonly webview = {
        onDidReceiveMessage: this.messages.event,
        postMessage: async (message: unknown) => {
            this.posted.push(message);
            return true;
        },
    };

    /** VS Code disposes the panel of a closed tab, and fires its dispose event once. */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.disposals.fire();
    }

    receive(message: unknown): void {
        this.messages.fire(message);
    }

    show(state: { active: boolean; visible: boolean }): void {
        if (state.active === this.active && state.visible === this.visible) return;
        this.active = state.active;
        this.visible = state.visible;
        this.viewStates.fire({ webviewPanel: this });
    }
}

describeEditorHandleContract("VsCodeEditorHandle", ({ fileName, content }) => {
    const textDocumentChanges = new Emitter<unknown>();
    const configurationChanges = new Emitter<unknown>();
    const document = new FakeTextDocument(Uri.file(`/work/${fileName}`), content);
    const panel = new FakeWebviewPanel();
    const changeText = (change: () => void, text: string) => {
        change();
        textDocumentChanges.fire({ document, contentChanges: [{ text }] });
    };

    vscodeHost.onDidChangeTextDocument = textDocumentChanges.event;
    vscodeHost.onDidChangeConfiguration = configurationChanges.event;
    // VS Code applies an edit in another process and reports the change before the edit resolves.
    vscodeHost.applyEdit = async (edit) => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        for (const { range, text } of (edit as { replacements: { range: FakeRange; text: string }[] })
            .replacements) {
            changeText(() => document.replace(range.start.offset, range.end.offset, text), text);
        }
        return true;
    };

    // The editor id is the document URI, as `ModelerEditorController` names it.
    const handle = VsCodeEditorHandle.create(
        "bpmn",
        document.uri.toString(),
        panel as unknown as WebviewPanel,
        document as unknown as TextDocument,
    );
    return {
        handle,
        sendFromWebview: (message) => panel.receive(message),
        receivedByWebview: () => panel.posted,
        focus: () => panel.show({ active: true, visible: true }),
        blur: () => panel.show({ active: false, visible: true }),
        editElsewhere: (edited) =>
            changeText(() => document.replace(0, document.getText().length, edited), edited),
        changeSettings: (values) => {
            const sections = Object.keys(values).map(
                (key) =>
                    `miragon.bpmnModeler.${settingKeyOf(key as keyof ModelerSettingsSnapshot)}`,
            );
            configurationChanges.fire({
                affectsConfiguration: (section: string) =>
                    sections.some(
                        (changed) => changed === section || changed.startsWith(`${section}.`),
                    ),
            });
        },
        close: () => panel.dispose(),
        hideWebview: () => panel.show({ active: false, visible: false }),
    };
});
