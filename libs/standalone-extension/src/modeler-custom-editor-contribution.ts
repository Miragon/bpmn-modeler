import type { FrontendApplicationContribution, Widget } from "@theia/core/lib/browser";
import { WidgetManager } from "@theia/core/lib/browser/widget-manager";
import type { CommandContribution, CommandRegistry } from "@theia/core/lib/common/command";
import type { Disposable, Event } from "@theia/core/lib/common";
import { inject, injectable } from "@theia/core/shared/inversify";
import {
    FLUSH_DOCUMENT_COMMAND,
    hasLiveModelerWebview,
    isModelerViewType,
    MODELER_CUSTOM_EDITOR_FACTORY_ID,
} from "./modeler-widget-flush";

const FLUSH_TIMEOUT_MS = 500;
const PROPERTIES_PANEL_INPUT_DEBOUNCE_MS = 600;
const DOCUMENT_SYNC_DEBOUNCE_MS = 300;
const PENDING_SYNC_GRACE_MS = PROPERTIES_PANEL_INPUT_DEBOUNCE_MS + DOCUMENT_SYNC_DEBOUNCE_MS + 100;
const SYNC_QUIET_MS = DOCUMENT_SYNC_DEBOUNCE_MS + 100;
const HOST_SYNC_POLL_MS = 10;
const SYNC_FAILURE_PREFIX = "Failed to sync diagram changes:";

interface KeybindingDispatcher {
    dispatchKeyDown(input: unknown, target?: EventTarget): void;
}

interface TextModel {
    getFullModelRange(): unknown;
    pushStackElement(): void;
    pushEditOperations(
        beforeCursorState: null,
        edits: Array<{ range: unknown; text: string; forceMoveMarkers: boolean }>,
        cursorStateComputer: null,
    ): unknown;
}

interface EditorTextModel {
    getText(): string;
    readonly textEditorModel: TextModel;
}

interface ModelerCustomEditorWidget extends Widget {
    readonly element?: HTMLIFrameElement;
    keybindings?: KeybindingDispatcher;
    readonly modelRef?: { readonly object?: { readonly editorTextModel?: EditorTextModel } };
    readonly onMessage?: Event<unknown>;
    readonly resource?: { toString(): string };
    sendMessage?(message: unknown): void;
    viewType?: string;
}

interface DocumentFlushedReply {
    readonly content?: string;
}

type PendingSyncObservation =
    { readonly status: "failed" } | { readonly status: "synced"; readonly content: string };

interface PendingSyncObserver {
    current(): PendingSyncObservation | undefined;
    dispose(): void;
    waitForDrain(): Promise<void>;
}

@injectable()
export class ModelerCustomEditorContribution
    implements FrontendApplicationContribution, CommandContribution
{
    @inject(WidgetManager)
    protected readonly widgetManager!: WidgetManager;

    private readonly adaptedWidgets = new WeakSet<Widget>();
    private nextFlushToken = -1;

    initialize(): void {
        this.widgetManager
            .getWidgets(MODELER_CUSTOM_EDITOR_FACTORY_ID)
            .forEach((widget) => this.adaptKeyboardForwarding(widget));
        this.widgetManager.onDidCreateWidget(({ factoryId, widget }) => {
            if (factoryId === MODELER_CUSTOM_EDITOR_FACTORY_ID) {
                this.adaptKeyboardForwarding(widget);
            }
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(
            { id: FLUSH_DOCUMENT_COMMAND },
            {
                execute: (editorId: string, viewType: string) =>
                    this.flushEditor(editorId, viewType),
            },
        );
    }

    private adaptKeyboardForwarding(widget: Widget): void {
        if (this.adaptedWidgets.has(widget)) {
            return;
        }

        const customEditor = widget as ModelerCustomEditorWidget;
        const keybindings = customEditor.keybindings;
        if (!keybindings) {
            return;
        }

        customEditor.keybindings = new Proxy(keybindings, {
            get: (target, property) => {
                if (property === "dispatchKeyDown") {
                    return (input: unknown, eventTarget?: EventTarget): void => {
                        if (isModelerViewType(customEditor.viewType) && isUndoRedoShortcut(input)) {
                            return;
                        }
                        target.dispatchKeyDown(input, eventTarget);
                    };
                }

                const value = Reflect.get(target, property, target) as unknown;
                return typeof value === "function" ? value.bind(target) : value;
            },
        });
        this.adaptedWidgets.add(widget);
    }

    private async flushEditor(editorId: string, viewType: string): Promise<boolean> {
        if (!isModelerViewType(viewType)) {
            return false;
        }

        const widget = this.widgetManager
            .getWidgets(MODELER_CUSTOM_EDITOR_FACTORY_ID)
            .map((candidate) => candidate as ModelerCustomEditorWidget)
            .find(
                (candidate) =>
                    candidate.viewType === viewType && candidate.resource?.toString() === editorId,
            );
        if (!widget || widget.isDisposed) {
            return false;
        }
        if (!hasLiveModelerWebview(widget)) {
            return true;
        }

        const pendingSync = this.observePendingSync(widget);
        try {
            widget.element.blur();
            widget.node.focus();
            await nextTask();

            await pendingSync.waitForDrain();
            const initialObservation = pendingSync.current();
            if (initialObservation?.status === "failed") {
                return false;
            }

            const reply = await this.requestFlush(widget);
            if (!reply) {
                return false;
            }
            if (reply.content !== undefined) {
                return this.applyFlushedContent(widget, reply.content);
            }

            const observation = pendingSync.current();
            if (observation?.status === "failed") {
                return false;
            }
            if (observation?.status === "synced") {
                if (await this.waitForHostContent(widget, pendingSync)) {
                    return true;
                }
                const latestObservation = pendingSync.current();
                if (latestObservation?.status === "failed") {
                    return false;
                }
                if (latestObservation?.status === "synced") {
                    return this.applyFlushedContent(widget, latestObservation.content);
                }
            }
            return true;
        } finally {
            pendingSync.dispose();
        }
    }

    private observePendingSync(widget: ModelerCustomEditorWidget): PendingSyncObserver {
        const onMessage = widget.onMessage;
        const cleanup: {
            subscription?: Disposable;
            timer?: ReturnType<typeof setTimeout>;
        } = {};
        let observation: PendingSyncObservation | undefined;
        let drainDeadline = Date.now() + PENDING_SYNC_GRACE_MS;
        let resolveDrain: () => void = () => undefined;
        let drainSettled = false;
        const drain = new Promise<void>((resolve) => {
            resolveDrain = resolve;
        });
        const settleDrain = (): void => {
            if (drainSettled) {
                return;
            }
            drainSettled = true;
            clearTimeout(cleanup.timer);
            resolveDrain();
        };
        const scheduleDrain = (deadline = drainDeadline): void => {
            if (drainSettled) {
                return;
            }
            drainDeadline = Math.max(drainDeadline, deadline);
            clearTimeout(cleanup.timer);
            cleanup.timer = setTimeout(settleDrain, Math.max(0, drainDeadline - Date.now()));
        };

        if (onMessage) {
            cleanup.subscription = onMessage((message) => {
                if (!isRecord(message)) {
                    return;
                }
                if (message.type === "SyncDocumentCommand" && typeof message.content === "string") {
                    observation = { status: "synced", content: message.content };
                    scheduleDrain(Date.now() + SYNC_QUIET_MS);
                } else if (
                    message.type === "LogErrorCommand" &&
                    typeof message.message === "string" &&
                    message.message.startsWith(SYNC_FAILURE_PREFIX)
                ) {
                    observation = { status: "failed" };
                    settleDrain();
                }
            });
            // Keep extending the drain while normal syncs (including align-to-origin) arrive.
            scheduleDrain();
        } else {
            settleDrain();
        }

        return {
            current: () => observation,
            dispose: () => {
                settleDrain();
                cleanup.subscription?.dispose();
            },
            waitForDrain: () => drain,
        };
    }

    private requestFlush(
        widget: ModelerCustomEditorWidget,
    ): Promise<DocumentFlushedReply | undefined> {
        const token = this.nextFlushToken--;
        return new Promise((resolve) => {
            const cleanup: {
                subscription?: Disposable;
                timer?: ReturnType<typeof setTimeout>;
            } = {};
            let settled = false;
            const settle = (reply?: DocumentFlushedReply): void => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(cleanup.timer);
                cleanup.subscription?.dispose();
                resolve(reply);
            };

            if (!widget.onMessage || !widget.sendMessage) {
                settle();
                return;
            }

            cleanup.subscription = widget.onMessage((message) => {
                if (!isRecord(message) || message.type !== "DocumentFlushedCommand") {
                    return;
                }
                if (message.token !== token) {
                    return;
                }
                if (
                    message.content !== undefined &&
                    message.content !== null &&
                    typeof message.content !== "string"
                ) {
                    settle();
                    return;
                }
                settle({
                    content: typeof message.content === "string" ? message.content : undefined,
                });
            });
            cleanup.timer = setTimeout(() => settle(), FLUSH_TIMEOUT_MS);

            try {
                widget.sendMessage({ type: "FlushDocumentQuery", token });
            } catch {
                settle();
            }
        });
    }

    private async applyFlushedContent(
        widget: ModelerCustomEditorWidget,
        content: string,
    ): Promise<boolean> {
        const editorTextModel = widget.modelRef?.object?.editorTextModel;
        if (!editorTextModel) {
            return false;
        }
        if (sameContent(editorTextModel.getText(), content)) {
            return true;
        }

        try {
            const textModel = editorTextModel.textEditorModel;
            textModel.pushStackElement();
            textModel.pushEditOperations(
                null,
                [
                    {
                        range: textModel.getFullModelRange(),
                        text: content,
                        forceMoveMarkers: true,
                    },
                ],
                null,
            );
            textModel.pushStackElement();
            await nextTask();
            return sameContent(editorTextModel.getText(), content);
        } catch {
            return false;
        }
    }

    private async waitForHostContent(
        widget: ModelerCustomEditorWidget,
        pendingSync: PendingSyncObserver,
    ): Promise<boolean> {
        const editorTextModel = widget.modelRef?.object?.editorTextModel;
        if (!editorTextModel) {
            return false;
        }

        for (let elapsed = 0; elapsed < FLUSH_TIMEOUT_MS; elapsed += HOST_SYNC_POLL_MS) {
            const observation = pendingSync.current();
            if (observation?.status === "failed") {
                return false;
            }
            if (
                observation?.status === "synced" &&
                sameContent(editorTextModel.getText(), observation.content)
            ) {
                await nextTask();
                const latestObservation = pendingSync.current();
                if (
                    latestObservation?.status === "synced" &&
                    latestObservation.content === observation.content &&
                    sameContent(editorTextModel.getText(), latestObservation.content)
                ) {
                    return true;
                }
            }
            await new Promise<void>((resolve) => setTimeout(resolve, HOST_SYNC_POLL_MS));
        }
        return false;
    }
}

function isUndoRedoShortcut(input: unknown): boolean {
    if (!isRecord(input) || typeof input.key !== "string") {
        return false;
    }
    if ((!input.ctrlKey && !input.metaKey) || input.altKey) {
        return false;
    }

    const key = input.key.toLowerCase();
    return key === "y" || key === "z";
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
    return typeof value === "object" && value !== null;
}

function sameContent(left: string, right: string): boolean {
    return left === right || left.replace(/\r\n/g, "\n") === right.replace(/\r\n/g, "\n");
}

function nextTask(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
