import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@theia/core/lib/browser/widget-manager", () => ({
    WidgetManager: class {},
}));

import { ModelerCustomEditorContribution } from "./modeler-custom-editor-contribution";
import { FLUSH_DOCUMENT_COMMAND } from "./modeler-widget-flush";

interface TestWidgetOptions {
    applyNormalSyncToHost?: boolean;
    content?: string;
    flushedContent?: string;
    live?: boolean;
    normalSyncContent?: string;
    normalSyncDelay?: number;
    reply?: boolean;
    replyDelay?: number;
    syncFailure?: boolean;
    viewType?: string;
}

function customEditorWidget(options: TestWidgetOptions = {}) {
    let content = options.content ?? "<before/>";
    const messageListeners = new Set<(message: unknown) => void>();
    const emitMessage = (message: unknown): void => {
        for (const listener of messageListeners) {
            listener(message);
        }
    };
    const scheduleMessage = (message: unknown, delay?: number): void => {
        if (delay === undefined) {
            queueMicrotask(() => emitMessage(message));
        } else {
            setTimeout(() => emitMessage(message), delay);
        }
    };
    const scheduleHostContent = (nextContent: string, delay?: number): void => {
        if (delay === undefined) {
            queueMicrotask(() => {
                content = nextContent;
            });
        } else {
            setTimeout(() => {
                content = nextContent;
            }, delay);
        }
    };
    const blur = vi.fn(() => {
        if (options.normalSyncContent !== undefined) {
            scheduleMessage(
                { type: "SyncDocumentCommand", content: options.normalSyncContent },
                options.normalSyncDelay,
            );
            if (options.applyNormalSyncToHost !== false) {
                scheduleHostContent(options.normalSyncContent, options.normalSyncDelay);
            }
        } else if (options.syncFailure) {
            scheduleMessage(
                {
                    type: "LogErrorCommand",
                    message: "Failed to sync diagram changes: export failed",
                },
                options.normalSyncDelay,
            );
        }
    });
    const focus = vi.fn();
    const dispatchKeyDown = vi.fn();
    const pushEditOperations = vi.fn(
        (_beforeCursorState: null, edits: Array<{ text: string }>, _cursorStateComputer: null) => {
            content = edits[0].text;
        },
    );
    const sendMessage = vi.fn((message: { token: number; type: string }) => {
        if (options.reply === false) {
            return;
        }
        scheduleMessage(
            {
                type: "DocumentFlushedCommand",
                token: message.token,
                ...(options.flushedContent === undefined
                    ? {}
                    : { content: options.flushedContent }),
            },
            options.replyDelay,
        );
    });

    return {
        widget: {
            element: options.live === false ? undefined : { blur },
            id: "modeler",
            isDisposed: false,
            keybindings: { dispatchKeyDown },
            modelRef: {
                object: {
                    editorTextModel: {
                        getText: () => content,
                        textEditorModel: {
                            getFullModelRange: () => ({ startLineNumber: 1 }),
                            pushEditOperations,
                            pushStackElement: vi.fn(),
                        },
                    },
                },
            },
            node: { focus },
            onMessage: (listener: (message: unknown) => void) => {
                messageListeners.add(listener);
                return { dispose: () => messageListeners.delete(listener) };
            },
            resource: { toString: () => "file:///process.bpmn" },
            sendMessage,
            viewType: options.viewType ?? "bpmn-modeler.bpmn",
        },
        blur,
        dispatchKeyDown,
        emitMessage,
        focus,
        getContent: () => content,
        pushEditOperations,
        sendMessage,
        setContent: (nextContent: string) => {
            content = nextContent;
        },
    };
}

function setup(widget: unknown) {
    const createdListeners: Array<(event: { factoryId: string; widget: never }) => void> = [];
    const widgetManager = {
        getWidgets: vi.fn(() => [widget]),
        onDidCreateWidget: vi.fn(
            (listener: (event: { factoryId: string; widget: never }) => void) => {
                createdListeners.push(listener);
                return { dispose: vi.fn() };
            },
        ),
    };
    const contribution = new ModelerCustomEditorContribution();
    Object.assign(contribution, { widgetManager });

    let commandHandler:
        { execute(editorId: string, viewType: string): Promise<boolean> } | undefined;
    const commands = {
        registerCommand: vi.fn(
            (
                _command: { id: string },
                handler: { execute(editorId: string, viewType: string): Promise<boolean> },
            ) => {
                commandHandler = handler;
                return { dispose: vi.fn() };
            },
        ),
    };
    contribution.registerCommands(commands as never);

    return {
        command: (editorId = "file:///process.bpmn", viewType = "bpmn-modeler.bpmn") =>
            commandHandler!.execute(editorId, viewType),
        commands,
        contribution,
        createdListeners,
        widgetManager,
    };
}

describe("ModelerCustomEditorContribution", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("flushes pending XML into Theia's text model before relocation", async () => {
        vi.useFakeTimers();
        const candidate = customEditorWidget({ flushedContent: "<after/>" });
        const { command, commands } = setup(candidate.widget);

        const flushing = command();
        await vi.runAllTimersAsync();
        await expect(flushing).resolves.toBe(true);

        expect(commands.registerCommand).toHaveBeenCalledWith(
            { id: FLUSH_DOCUMENT_COMMAND },
            expect.any(Object),
        );
        expect(candidate.blur).toHaveBeenCalledOnce();
        expect(candidate.focus).toHaveBeenCalledOnce();
        expect(candidate.sendMessage).toHaveBeenCalledWith({
            type: "FlushDocumentQuery",
            token: expect.any(Number),
        });
        expect(candidate.sendMessage.mock.calls[0][0].token).toBeLessThan(0);
        expect(candidate.pushEditOperations).toHaveBeenCalledOnce();
        expect(candidate.getContent()).toBe("<after/>");
    });

    it("waits through the properties-panel and document-sync debounces", async () => {
        vi.useFakeTimers();
        const candidate = customEditorWidget({ flushedContent: "<after/>" });
        const { command } = setup(candidate.widget);

        const flushing = command();
        await vi.advanceTimersByTimeAsync(900);

        expect(candidate.sendMessage).not.toHaveBeenCalled();

        await vi.runAllTimersAsync();
        await expect(flushing).resolves.toBe(true);
    });

    it("accepts an idle reply without changing the text model", async () => {
        vi.useFakeTimers();
        const candidate = customEditorWidget();
        const { command } = setup(candidate.widget);

        const flushing = command();
        await vi.runAllTimersAsync();
        await expect(flushing).resolves.toBe(true);

        expect(candidate.pushEditOperations).not.toHaveBeenCalled();
        expect(candidate.getContent()).toBe("<before/>");
    });

    it("keeps the editor in its window when the normal sync export fails", async () => {
        const candidate = customEditorWidget({ syncFailure: true });
        const { command } = setup(candidate.widget);

        await expect(command()).resolves.toBe(false);

        expect(candidate.sendMessage).not.toHaveBeenCalled();
        expect(candidate.pushEditOperations).not.toHaveBeenCalled();
    });

    it("accepts a guarded host sync observed while draining the debounce", async () => {
        const candidate = customEditorWidget({ normalSyncContent: "<after/>" });
        const { command } = setup(candidate.widget);

        await expect(command()).resolves.toBe(true);

        expect(candidate.sendMessage).toHaveBeenCalledOnce();
        expect(candidate.pushEditOperations).not.toHaveBeenCalled();
        expect(candidate.getContent()).toBe("<after/>");
    });

    it("waits for a quiet period after every observed sync", async () => {
        vi.useFakeTimers();
        const candidate = customEditorWidget();
        const { command } = setup(candidate.widget);

        const flushing = command();
        setTimeout(() => {
            candidate.emitMessage({ type: "SyncDocumentCommand", content: "<old/>" });
            candidate.setContent("<old/>");
        }, 900);
        setTimeout(() => {
            candidate.emitMessage({ type: "SyncDocumentCommand", content: "<new/>" });
            candidate.setContent("<new/>");
        }, 1_200);

        await vi.advanceTimersByTimeAsync(1_400);
        expect(candidate.sendMessage).not.toHaveBeenCalled();

        await vi.runAllTimersAsync();
        await expect(flushing).resolves.toBe(true);
        expect(candidate.sendMessage).toHaveBeenCalledOnce();
        expect(candidate.getContent()).toBe("<new/>");
        expect(candidate.pushEditOperations).not.toHaveBeenCalled();
    });

    it("falls back to explicit XML when the guarded host sync does not settle", async () => {
        vi.useFakeTimers();
        const candidate = customEditorWidget({
            applyNormalSyncToHost: false,
            flushedContent: "<fallback/>",
            normalSyncContent: "<normal/>",
        });
        const { command } = setup(candidate.widget);

        const flushing = command();
        await vi.runAllTimersAsync();

        await expect(flushing).resolves.toBe(true);
        expect(candidate.sendMessage).toHaveBeenCalledOnce();
        expect(candidate.pushEditOperations).toHaveBeenCalledOnce();
        expect(candidate.getContent()).toBe("<fallback/>");
    });

    it("observes a sync failure that arrives after the debounce grace period", async () => {
        vi.useFakeTimers();
        const candidate = customEditorWidget({
            normalSyncDelay: 1_050,
            replyDelay: 100,
            syncFailure: true,
        });
        const { command } = setup(candidate.widget);

        const flushing = command();
        await vi.runAllTimersAsync();

        await expect(flushing).resolves.toBe(false);
    });

    it("applies a delayed normal sync received before the flush reply", async () => {
        vi.useFakeTimers();
        const candidate = customEditorWidget({
            normalSyncContent: "<after/>",
            normalSyncDelay: 1_050,
            replyDelay: 100,
        });
        const { command } = setup(candidate.widget);

        const flushing = command();
        await vi.runAllTimersAsync();

        await expect(flushing).resolves.toBe(true);
        expect(candidate.getContent()).toBe("<after/>");
        expect(candidate.pushEditOperations).not.toHaveBeenCalled();
    });

    it("fails when sync export reports an error while the host write is settling", async () => {
        vi.useFakeTimers();
        const candidate = customEditorWidget({ applyNormalSyncToHost: false, replyDelay: 100 });
        const { command } = setup(candidate.widget);

        const flushing = command();
        setTimeout(
            () =>
                candidate.emitMessage({
                    type: "SyncDocumentCommand",
                    content: "<stale/>",
                }),
            1_050,
        );
        setTimeout(
            () =>
                candidate.emitMessage({
                    type: "LogErrorCommand",
                    message: "Failed to sync diagram changes: export failed",
                }),
            1_150,
        );

        await vi.runAllTimersAsync();

        await expect(flushing).resolves.toBe(false);
        expect(candidate.pushEditOperations).not.toHaveBeenCalled();
    });

    it("accepts a hidden editor without queuing a webview message", async () => {
        const candidate = customEditorWidget({ live: false });
        const { command } = setup(candidate.widget);

        await expect(command()).resolves.toBe(true);

        expect(candidate.sendMessage).not.toHaveBeenCalled();
        expect(candidate.focus).not.toHaveBeenCalled();
    });

    it("keeps the editor in its window when the webview does not reply", async () => {
        vi.useFakeTimers();
        const candidate = customEditorWidget({ reply: false });
        const { command } = setup(candidate.widget);

        const flushing = command();
        await vi.runAllTimersAsync();

        await expect(flushing).resolves.toBe(false);
    });

    it("rejects a command for a missing or non-modeler editor", async () => {
        const candidate = customEditorWidget();
        const { command, widgetManager } = setup(candidate.widget);

        await expect(command("file:///missing.bpmn")).resolves.toBe(false);
        await expect(command("file:///process.bpmn", "other.editor")).resolves.toBe(false);
        expect(widgetManager.getWidgets).toHaveBeenCalledTimes(1);
    });

    it("keeps modeler undo and redo inside the webview", () => {
        const candidate = customEditorWidget();
        const { contribution } = setup(candidate.widget);
        contribution.initialize();

        candidate.widget.keybindings.dispatchKeyDown({ key: "z", ctrlKey: true });
        candidate.widget.keybindings.dispatchKeyDown({ key: "y", metaKey: true });
        candidate.widget.keybindings.dispatchKeyDown({ key: "w", ctrlKey: true });

        expect(candidate.dispatchKeyDown).toHaveBeenCalledOnce();
        expect(candidate.dispatchKeyDown).toHaveBeenCalledWith(
            { key: "w", ctrlKey: true },
            undefined,
        );
    });

    it("does not change keyboard forwarding for other custom editors", () => {
        const candidate = customEditorWidget({ viewType: "other.editor" });
        const { contribution } = setup(candidate.widget);
        contribution.initialize();

        candidate.widget.keybindings.dispatchKeyDown({ key: "z", ctrlKey: true });

        expect(candidate.dispatchKeyDown).toHaveBeenCalledOnce();
    });
});
