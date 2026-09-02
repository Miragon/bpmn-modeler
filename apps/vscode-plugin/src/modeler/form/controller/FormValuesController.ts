import { randomUUID } from "node:crypto";
import { basename } from "node:path";

import {
    commands,
    ExtensionContext,
    Tab,
    TabChangeEvent,
    TabInputText,
    TextDocument,
    TextDocumentChangeEvent,
    Uri,
    ViewColumn,
    window,
    workspace,
} from "vscode";

import { EditorSessionStore } from "@miragon/bpmn-modeler-core";
import { FormInputValuesQuery } from "@miragon/bpmn-modeler-shared";

import { VsCodeNotifier } from "../../../shared/infrastructure/VsCodeNotifier";
import { InMemoryJsonFileSystemProvider } from "../infrastructure/InMemoryJsonFileSystemProvider";

export const TOGGLE_FORM_INPUT_VALUES_CMD = "bpmn-modeler.toggleFormInputValues";
export const TOGGLE_FORM_OUTPUT_VALUES_CMD = "bpmn-modeler.toggleFormOutputValues";
export const FORM_INPUT_VALUES_SCHEME = "bpmn-form-input-values";
export const FORM_OUTPUT_VALUES_SCHEME = "bpmn-form-output-values";
const INPUT_SAVE_DELAY_MS = 300;

type FormValueKind = "input" | "output";

interface FormValuesSession {
    readonly editorId: string;
    readonly inputUri: Uri;
    readonly outputUri: Uri;
    inputContent: string;
    disposed: boolean;
}

interface VirtualDocumentOwner {
    readonly session: FormValuesSession;
    readonly kind: FormValueKind;
}

export class FormValuesController {
    private readonly inputFiles = new InMemoryJsonFileSystemProvider();
    private readonly outputFiles = new InMemoryJsonFileSystemProvider(true);
    private readonly sessions = new Map<string, FormValuesSession>();
    // Preserve backing data when VS Code refuses to close a dirty companion tab.
    private readonly retiredSessions = new Set<FormValuesSession>();
    private readonly owners = new Map<string, VirtualDocumentOwner>();
    private readonly scheduledSaves = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly saves = new Map<string, Promise<boolean>>();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly notifier: VsCodeNotifier,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            workspace.registerFileSystemProvider(FORM_INPUT_VALUES_SCHEME, this.inputFiles, {
                isCaseSensitive: true,
            }),
            workspace.registerFileSystemProvider(FORM_OUTPUT_VALUES_SCHEME, this.outputFiles, {
                isCaseSensitive: true,
                isReadonly: true,
            }),
            workspace.onDidChangeTextDocument((event) => this.handleDocumentChange(event)),
            window.tabGroups.onDidChangeTabs((event) => this.handleTabsChanged(event)),
            commands.registerCommand(TOGGLE_FORM_INPUT_VALUES_CMD, this.toggleInputValues, this),
            commands.registerCommand(TOGGLE_FORM_OUTPUT_VALUES_CMD, this.toggleOutputValues, this),
            {
                dispose: () => {
                    for (const timer of this.scheduledSaves.values()) clearTimeout(timer);
                    this.inputFiles.dispose();
                    this.outputFiles.dispose();
                    this.sessions.clear();
                    this.retiredSessions.clear();
                    this.owners.clear();
                    this.scheduledSaves.clear();
                    this.saves.clear();
                },
            },
        );
        this.closeStaleTabs(window.tabGroups.all.flatMap((group) => group.tabs));
    }

    registerSession(editorId: string): void {
        const existing = this.sessions.get(editorId);
        if (existing) void this.retireSession(existing);

        const sourceName = formName(editorId);
        const authority = randomUUID();
        const inputUri = Uri.from({
            scheme: FORM_INPUT_VALUES_SCHEME,
            authority,
            path: `/${sourceName}.input.json`,
        });
        const outputUri = Uri.from({
            scheme: FORM_OUTPUT_VALUES_SCHEME,
            authority,
            path: `/${sourceName}.output.json`,
        });
        const inputContent = serialize({});
        const session = { editorId, inputUri, outputUri, inputContent, disposed: false };

        this.sessions.set(editorId, session);
        this.owners.set(inputUri.toString(), { session, kind: "input" });
        this.owners.set(outputUri.toString(), { session, kind: "output" });
        this.inputFiles.setContent(inputUri, inputContent);
        this.outputFiles.setContent(outputUri, serialize({}));
    }

    async disposeSession(editorId: string): Promise<void> {
        const session = this.sessions.get(editorId);
        if (!session) return;
        await this.retireSession(session);
    }

    private async retireSession(session: FormValuesSession): Promise<void> {
        session.disposed = true;
        if (this.sessions.get(session.editorId) === session) {
            this.sessions.delete(session.editorId);
        }
        this.retiredSessions.add(session);
        const uris = [session.inputUri, session.outputUri];
        for (const uri of uris) this.cancelScheduledSave(uri);

        const documents = workspace.textDocuments.filter((document) =>
            uris.some((uri) => sameUri(document.uri, uri)),
        );
        await Promise.all(
            documents.filter((document) => document.isDirty).map((document) => this.save(document)),
        );

        const tabs = uris.flatMap((uri) => this.findTabs(uri));
        if (tabs.length === 0) {
            this.removeSession(session);
            return;
        }

        try {
            if (await window.tabGroups.close(tabs)) this.removeSession(session);
        } catch (error) {
            this.logError(error);
        }
    }

    toggleInputValues(): Promise<boolean> {
        return this.toggleValues("input");
    }

    toggleOutputValues(): Promise<boolean> {
        return this.toggleValues("output");
    }

    async sendInputValues(editorId: string): Promise<void> {
        const session = this.sessions.get(editorId);
        if (!session || session.disposed) return;
        await this.editorStore.postMessage(
            editorId,
            new FormInputValuesQuery(session.inputContent),
        );
    }

    updateOutputValues(editorId: string, content: string): void {
        const session = this.sessions.get(editorId);
        const normalized = normalizeJsonObject(content);
        if (!session || session.disposed || normalized === undefined) return;
        this.outputFiles.setContent(session.outputUri, normalized);
    }

    private async toggleValues(kind: FormValueKind): Promise<boolean> {
        const session = this.activeSession();
        if (!session) return false;

        const uri = kind === "input" ? session.inputUri : session.outputUri;
        const existing = this.findTabs(uri)[0];
        if (existing) return !(await window.tabGroups.close(existing));

        const document = await workspace.openTextDocument(uri);
        await commands.executeCommand(
            "vscode.openWith",
            document.uri,
            "default",
            ViewColumn.Beside,
        );
        return true;
    }

    private activeSession(): FormValuesSession | undefined {
        const activeTextUri = window.activeTextEditor?.document.uri;
        if (activeTextUri && isFormValuesUri(activeTextUri)) {
            const owner = this.owners.get(activeTextUri.toString());
            return owner && !owner.session.disposed ? owner.session : undefined;
        }

        try {
            return this.sessions.get(this.editorStore.getActiveEditorId());
        } catch {
            return undefined;
        }
    }

    private handleDocumentChange(event: TextDocumentChangeEvent): void {
        if (event.contentChanges.length === 0) return;

        const owner = this.owners.get(event.document.uri.toString());
        if (!owner || owner.kind !== "input") return;

        this.scheduleSave(event.document);
        const normalized = normalizeJsonObject(event.document.getText());
        const session = owner.session;
        if (session.disposed || normalized === undefined || normalized === session.inputContent) {
            return;
        }

        session.inputContent = normalized;
        void this.sendInputValues(session.editorId).catch((error) => this.logError(error));
    }

    private scheduleSave(document: TextDocument): void {
        const key = document.uri.toString();
        const existing = this.scheduledSaves.get(key);
        if (existing) clearTimeout(existing);

        this.scheduledSaves.set(
            key,
            setTimeout(() => {
                this.scheduledSaves.delete(key);
                void this.save(document);
            }, INPUT_SAVE_DELAY_MS),
        );
    }

    private save(document: TextDocument): Promise<boolean> {
        const key = document.uri.toString();
        const previous = this.saves.get(key) ?? Promise.resolve(true);
        const saving = previous.then(async () => {
            if (document.isDirty === false) return true;
            try {
                const saved = await document.save();
                if (!saved) this.logError(new Error(`Could not save in-memory document ${key}.`));
                return saved;
            } catch (error) {
                this.logError(error);
                return false;
            }
        });
        this.saves.set(key, saving);
        void saving.then(() => {
            if (this.saves.get(key) === saving) this.saves.delete(key);
        });
        return saving;
    }

    private cancelScheduledSave(uri: Uri): void {
        const key = uri.toString();
        const timer = this.scheduledSaves.get(key);
        if (timer) clearTimeout(timer);
        this.scheduledSaves.delete(key);
    }

    private handleTabsChanged(event: TabChangeEvent): void {
        for (const tab of event.closed) {
            const uri = virtualTabUri(tab);
            if (uri && !this.owners.has(uri.toString())) this.deleteStaleFile(uri);
        }
        for (const session of this.retiredSessions) {
            if (
                this.findTabs(session.inputUri).length + this.findTabs(session.outputUri).length ===
                0
            ) {
                this.removeSession(session);
            }
        }
        this.closeStaleTabs(event.opened);
    }

    private closeStaleTabs(tabs: readonly Tab[]): void {
        // Restored tabs cannot be reattached after their extension-host session is gone.
        const stale = tabs.filter((tab) => {
            const uri = virtualTabUri(tab);
            return uri !== undefined && !this.owners.has(uri.toString());
        });
        if (stale.length === 0) return;

        for (const tab of stale) {
            const uri = virtualTabUri(tab)!;
            this.providerFor(uri).setContent(uri, serialize({}));
        }
        void window.tabGroups.close(stale).then(
            (closed) => {
                if (!closed) return;
                for (const tab of stale) this.deleteStaleFile(virtualTabUri(tab)!);
            },
            (error: unknown) => this.logError(error),
        );
    }

    private removeSession(session: FormValuesSession): void {
        if (this.sessions.get(session.editorId) === session) {
            this.sessions.delete(session.editorId);
        }
        this.retiredSessions.delete(session);
        this.owners.delete(session.inputUri.toString());
        this.owners.delete(session.outputUri.toString());
        this.inputFiles.deleteFile(session.inputUri);
        this.outputFiles.deleteFile(session.outputUri);
    }

    private deleteStaleFile(uri: Uri): void {
        this.providerFor(uri).deleteFile(uri);
    }

    private providerFor(uri: Uri): InMemoryJsonFileSystemProvider {
        return uri.scheme === FORM_INPUT_VALUES_SCHEME ? this.inputFiles : this.outputFiles;
    }

    private findTabs(uri: Uri): Tab[] {
        return window.tabGroups.all.flatMap((group) =>
            group.tabs.filter(
                (tab) => tab.input instanceof TabInputText && sameUri(tab.input.uri, uri),
            ),
        );
    }

    private logError(error: unknown): void {
        this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
    }
}

function virtualTabUri(tab: Tab): Uri | undefined {
    if (!(tab.input instanceof TabInputText)) return undefined;
    return isFormValuesUri(tab.input.uri) ? tab.input.uri : undefined;
}

function isFormValuesUri(uri: Uri): boolean {
    return uri.scheme === FORM_INPUT_VALUES_SCHEME || uri.scheme === FORM_OUTPUT_VALUES_SCHEME;
}

function formName(editorId: string): string {
    const fileName = basename(Uri.parse(editorId).path);
    return fileName.toLowerCase().endsWith(".form") ? fileName.slice(0, -5) : fileName;
}

function sameUri(left: Uri, right: Uri): boolean {
    return left.toString() === right.toString();
}

function normalizeJsonObject(content: string): string | undefined {
    try {
        const value: unknown = JSON.parse(content);
        if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
        return serialize(value);
    } catch {
        return undefined;
    }
}

function serialize(value: unknown): string {
    return JSON.stringify(value, null, 2);
}
