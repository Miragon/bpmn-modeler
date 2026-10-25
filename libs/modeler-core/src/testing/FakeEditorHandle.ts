import { Command, Query } from "@miragon/bpmn-modeler-shared";

import {
    DocumentChangeEvent,
    EditorHandle,
    EditorSubscription,
    SettingChange,
} from "../shared/domain/EditorSession";

class Listeners<T> {
    private readonly callbacks = new Set<(event: T) => void>();

    add(callback: (event: T) => void): EditorSubscription {
        this.callbacks.add(callback);
        return { dispose: () => this.callbacks.delete(callback) };
    }

    emit(event: T): void {
        [...this.callbacks].forEach((callback) => callback(event));
    }
}

/**
 * One host's document-change stream. VS Code fires its change event for every
 * open document, so each handle of a test host shares one stream and a
 * participant that forgets to filter by document reacts to foreign edits here
 * as it would in VS Code.
 */
export class DocumentChangeStream {
    private readonly listeners = new Listeners<DocumentChangeEvent>();

    subscribe(callback: (event: DocumentChangeEvent) => void): EditorSubscription {
        return this.listeners.add(callback);
    }

    publish(event: DocumentChangeEvent): void {
        this.listeners.emit(event);
    }
}

/**
 * An open editor whose document and webview live in memory. `posted` records
 * what reached the webview; the `receive`/`change*`/`becomeActive`/`loseFocus` methods play
 * the host events a session subscribes to.
 */
export class FakeEditorHandle implements EditorHandle {
    readonly id: string;
    readonly posted: Array<Command | Query> = [];
    content: string;
    active = false;
    /** A hidden webview rejects posts the way a host handle does. */
    hidden = false;
    saveCount = 0;
    reloadCount = 0;
    disposed = false;

    private readonly scheme: string;
    private readonly subscriptions: EditorSubscription[] = [];
    private readonly messages = new Listeners<Command>();
    private readonly disposals = new Listeners<void>();
    private readonly activations = new Listeners<boolean>();
    private readonly settingChanges = new Listeners<SettingChange>();
    private readonly documentChanges: DocumentChangeStream;

    constructor(
        private readonly path: string,
        {
            content = "",
            scheme = "file",
            documentChanges = new DocumentChangeStream(),
        }: { content?: string; scheme?: string; documentChanges?: DocumentChangeStream } = {},
    ) {
        this.id = `${scheme}://${path}`;
        this.content = content;
        this.scheme = scheme;
        this.documentChanges = documentChanges;
    }

    documentUriString(): string {
        return this.id;
    }

    documentPath(): string {
        return this.path;
    }

    documentFsPath(): string {
        return this.path;
    }

    documentScheme(): string {
        return this.scheme;
    }

    getContent(): string {
        return this.content;
    }

    async writeContent(content: string): Promise<boolean> {
        if (content === this.content) return false;
        this.changeDocument(content);
        return true;
    }

    async save(): Promise<boolean> {
        this.saveCount++;
        return true;
    }

    async postMessage(message: Command | Query): Promise<boolean> {
        if (this.hidden) {
            throw new Error("The active editor is hidden.");
        }
        this.posted.push(message);
        return true;
    }

    postedOfType<T extends Command | Query>(type: T["type"]): T[] {
        return this.posted.filter((message): message is T => message.type === type);
    }

    reload(): void {
        this.reloadCount++;
    }

    isActive(): boolean {
        return this.active;
    }

    addSubscription(subscription: EditorSubscription): void {
        this.subscriptions.push(subscription);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.disposals.emit();
        this.subscriptions.forEach((subscription) => subscription.dispose());
    }

    onDidReceiveMessage(callback: (message: Command) => void): EditorSubscription {
        return this.messages.add(callback);
    }

    onDidDispose(callback: () => void): EditorSubscription {
        return this.disposals.add(callback);
    }

    onDidChangeActive(callback: (active: boolean) => void): EditorSubscription {
        return this.activations.add(callback);
    }

    onDidChangeDocument(callback: (event: DocumentChangeEvent) => void): EditorSubscription {
        return this.documentChanges.subscribe(callback);
    }

    onDidChangeSetting(callback: (event: SettingChange) => void): EditorSubscription {
        return this.settingChanges.add(callback);
    }

    receive(message: Command): void {
        this.messages.emit(message);
    }

    becomeActive(): void {
        this.active = true;
        this.activations.emit(true);
    }

    loseFocus(): void {
        this.active = false;
        this.activations.emit(false);
    }

    /** Plays an external edit: replaces the content and fires the document change. */
    changeDocument(content: string): void {
        this.content = content;
        this.documentChanges.publish({
            hasContentChanges: () => true,
            documentUriString: () => this.id,
            documentPath: () => this.path,
        });
    }

    changeSetting(...sections: string[]): void {
        this.settingChanges.emit({
            affectsConfiguration: (section) =>
                sections.some(
                    (changed) => changed === section || changed.startsWith(`${section}.`),
                ),
        });
    }
}
