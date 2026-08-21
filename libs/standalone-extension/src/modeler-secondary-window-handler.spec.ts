import { describe, expect, it, vi } from "vitest";

vi.mock("@theia/core/lib/browser/secondary-window-handler", () => ({
    SecondaryWindowHandler: class {
        readonly movedWidgets: unknown[] = [];
        readonly windows: Window[] = [];
        autoAddWidget = true;
        private readonly willAddListeners: Array<(event: [unknown, Window]) => void> = [];
        private readonly windowClosedListeners: Array<(window: Window) => void> = [];

        get widgets(): unknown[] {
            return [...this.movedWidgets];
        }

        protected readonly secondaryWindowService = {
            getWindows: () => this.windows,
            onWindowClosed: (listener: (window: Window) => void) => {
                this.windowClosedListeners.push(listener);
                return {
                    dispose: () => {
                        const index = this.windowClosedListeners.indexOf(listener);
                        if (index >= 0) {
                            this.windowClosedListeners.splice(index, 1);
                        }
                    },
                };
            },
        };

        readonly onWillAddWidget = (listener: (event: [unknown, Window]) => void) => {
            this.willAddListeners.push(listener);
            return {
                dispose: () => {
                    const index = this.willAddListeners.indexOf(listener);
                    if (index >= 0) {
                        this.willAddListeners.splice(index, 1);
                    }
                },
            };
        };

        moveWidgetToSecondaryWindow(widget: unknown): void {
            const newWindow = { close: vi.fn() } as unknown as Window;
            this.windows.push(newWindow);
            if (this.autoAddWidget) {
                this.emitWillAdd(widget, newWindow);
            }
            this.movedWidgets.push(widget);
        }

        addWidgetToSecondaryWindow(widget: unknown, secondaryWindow: Window): void {
            (widget as { secondaryWindow?: Window }).secondaryWindow = secondaryWindow;
            this.movedWidgets.push(widget);
        }

        emitWillAdd(widget: unknown, window = this.windows.at(-1)!): void {
            this.willAddListeners.forEach((listener) => listener([widget, window]));
        }

        closeWindow(window = this.windows.at(-1)!): void {
            this.windowClosedListeners.forEach((listener) => listener(window));
        }

        protected removeWidget(widget: unknown, _window: Window): void {
            const index = this.movedWidgets.indexOf(widget);
            if (index >= 0) {
                this.movedWidgets.splice(index, 1);
            }
        }

        restoreWidget(widget: unknown, window = this.windows.at(-1)!): void {
            this.removeWidget(widget, window);
        }
    },
}));

import type { ExtractableWidget, SaveableWidget } from "@theia/core/lib/browser";
import { ModelerSecondaryWindowHandler } from "./modeler-secondary-window-handler";

type TestModelerWidget = ExtractableWidget & SaveableWidget;

function modelerWidget(viewType: string, extension: string): TestModelerWidget {
    const closeWithSaving = vi.fn().mockResolvedValue(undefined);
    return {
        element: {},
        id: "modeler",
        isDisposed: false,
        isExtractable: true,
        previousArea: "main",
        resource: { toString: () => `file:///process.${extension}` },
        secondaryWindow: undefined,
        viewType,
        node: { inert: false },
        close: closeWithSaving,
        closeWithSaving,
        closeWithoutSaving: vi.fn().mockResolvedValue(undefined),
    } as unknown as TestModelerWidget;
}

describe("ModelerSecondaryWindowHandler", () => {
    it.each([
        ["bpmn-modeler.bpmn", "bpmn"],
        ["bpmn-modeler.dmn", "dmn"],
    ])("waits for a pending %s flush before extracting the widget", async (viewType, extension) => {
        let finishFlush: (success: boolean) => void = () => undefined;
        const executeCommand = vi.fn(
            () =>
                new Promise<boolean>((resolve) => {
                    finishFlush = resolve;
                }),
        );
        const handler = new ModelerSecondaryWindowHandler();
        Object.assign(handler, { commands: { executeCommand } });
        const widget = modelerWidget(viewType, extension);

        const moving = handler.moveWidgetToSecondaryWindow(widget);
        await Promise.resolve();

        expect(executeCommand).toHaveBeenCalledWith(
            "bpmn-modeler.flushDocument",
            `file:///process.${extension}`,
            viewType,
        );
        expect((handler as unknown as { movedWidgets: unknown[] }).movedWidgets).toEqual([]);
        expect(widget.node.inert).toBe(true);

        finishFlush(true);
        await moving;

        expect((handler as unknown as { movedWidgets: unknown[] }).movedWidgets).toEqual([widget]);
        expect(widget.node.inert).toBe(false);
    });

    it("guards tab close while the extraction flush is still pending", async () => {
        let finishExtraction: (success: boolean) => void = () => undefined;
        let finishClose: (success: boolean) => void = () => undefined;
        const executeCommand = vi
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise<boolean>((resolve) => {
                        finishExtraction = resolve;
                    }),
            )
            .mockImplementationOnce(
                () =>
                    new Promise<boolean>((resolve) => {
                        finishClose = resolve;
                    }),
            );
        const handler = new ModelerSecondaryWindowHandler();
        Object.assign(handler, { commands: { executeCommand } });
        const widget = modelerWidget("bpmn-modeler.bpmn", "bpmn");
        const closeWithSaving = widget.closeWithSaving;

        const moving = handler.moveWidgetToSecondaryWindow(widget);
        await Promise.resolve();
        widget.close();
        await Promise.resolve();

        const closeWasGuarded = vi.mocked(closeWithSaving).mock.calls.length === 0;
        const flushWasReused = executeCommand.mock.calls.length === 1;
        finishExtraction(true);
        await moving;
        await vi.waitFor(() => expect(executeCommand).toHaveBeenCalledTimes(2));
        finishClose(true);
        await vi.waitFor(() => expect(closeWithSaving).toHaveBeenCalledOnce());

        expect(closeWasGuarded).toBe(true);
        expect(flushWasReused).toBe(true);
    });

    it("keeps a failed extraction guarded until a later close flush succeeds", async () => {
        const executeCommand = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        const handler = new ModelerSecondaryWindowHandler();
        Object.assign(handler, {
            commands: { executeCommand },
        });
        const widget = modelerWidget("bpmn-modeler.bpmn", "bpmn");
        const close = widget.close;
        const closeWithSaving = widget.closeWithSaving;

        await handler.moveWidgetToSecondaryWindow(widget);

        expect((handler as unknown as { movedWidgets: unknown[] }).movedWidgets).toEqual([]);
        expect(widget.node.inert).toBe(false);
        expect(widget.close).not.toBe(close);
        expect(handler.modelerWidgets).toEqual([widget]);

        widget.close();
        await vi.waitFor(() => expect(closeWithSaving).toHaveBeenCalledOnce());
        expect(executeCommand).toHaveBeenCalledTimes(2);
    });

    it("keeps the modeler inert until Theia reaches the iframe relocation boundary", async () => {
        const handler = new ModelerSecondaryWindowHandler();
        Object.assign(handler, {
            commands: { executeCommand: vi.fn().mockResolvedValue(true) },
            autoAddWidget: false,
        });
        const widget = modelerWidget("bpmn-modeler.bpmn", "bpmn");

        const moving = handler.moveWidgetToSecondaryWindow(widget);
        await vi.waitFor(() =>
            expect((handler as unknown as { movedWidgets: unknown[] }).movedWidgets).toEqual([
                widget,
            ]),
        );

        expect(widget.node.inert).toBe(true);
        (handler as unknown as { emitWillAdd(candidate: unknown): void }).emitWillAdd(widget);
        await moving;
        expect(widget.node.inert).toBe(false);
    });

    it("restores interaction when a new window closes before relocating the widget", async () => {
        const handler = new ModelerSecondaryWindowHandler();
        Object.assign(handler, {
            commands: { executeCommand: vi.fn().mockResolvedValue(true) },
            autoAddWidget: false,
        });
        const widget = modelerWidget("bpmn-modeler.bpmn", "bpmn");

        const moving = handler.moveWidgetToSecondaryWindow(widget);
        await vi.waitFor(() =>
            expect((handler as unknown as { windows: Window[] }).windows).toHaveLength(1),
        );
        (handler as unknown as { closeWindow(): void }).closeWindow();
        await moving;

        expect(widget.node.inert).toBe(false);
    });

    it("aborts a relocation that never reaches the window load boundary", async () => {
        vi.useFakeTimers();
        try {
            const handler = new ModelerSecondaryWindowHandler();
            Object.assign(handler, {
                commands: { executeCommand: vi.fn().mockResolvedValue(true) },
                autoAddWidget: false,
            });
            const widget = modelerWidget("bpmn-modeler.bpmn", "bpmn");

            const moving = handler.moveWidgetToSecondaryWindow(widget);
            await vi.advanceTimersByTimeAsync(0);
            const [newWindow] = (handler as unknown as { windows: Window[] }).windows;

            expect(newWindow).toBeDefined();
            expect(widget.node.inert).toBe(true);
            await vi.advanceTimersByTimeAsync(5_000);
            await moving;

            expect(newWindow.close).toHaveBeenCalledOnce();
            expect(widget.node.inert).toBe(false);
            expect(handler.modelerWidgets).toEqual([widget]);

            await handler.moveWidgetToSecondaryWindow(widget);
            expect((handler as unknown as { windows: Window[] }).windows).toHaveLength(1);
            expect(newWindow.close).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("keeps a modeler opened from a secondary window in the main area", () => {
        const executeCommand = vi.fn();
        const addWidget = vi.fn();
        const handler = new ModelerSecondaryWindowHandler();
        Object.assign(handler, {
            applicationShell: { mainPanel: { addWidget } },
            commands: { executeCommand },
        });
        const widget = modelerWidget("bpmn-modeler.dmn", "dmn");
        const close = widget.close;
        const secondaryWindow = {} as Window;

        handler.addWidgetToSecondaryWindow(widget, secondaryWindow, {
            ref: {} as never,
            mode: "tab-after",
        });

        expect(addWidget).toHaveBeenCalledWith(widget, {
            ref: undefined,
            mode: "tab-after",
        });
        expect(executeCommand).not.toHaveBeenCalled();
        expect((handler as unknown as { movedWidgets: unknown[] }).movedWidgets).toEqual([]);
        expect(widget.close).toBe(close);
        expect(widget.secondaryWindow).toBeUndefined();
        expect(widget.node.inert).toBe(false);
    });

    it("tracks the correct window when two modelers are extracted concurrently", async () => {
        const finishFlushes: Array<(success: boolean) => void> = [];
        const executeCommand = vi.fn(
            () =>
                new Promise<boolean>((resolve) => {
                    finishFlushes.push(resolve);
                }),
        );
        const handler = new ModelerSecondaryWindowHandler();
        Object.assign(handler, {
            commands: { executeCommand },
            autoAddWidget: false,
        });
        const firstWidget = modelerWidget("bpmn-modeler.bpmn", "bpmn");
        const secondWidget = modelerWidget("bpmn-modeler.dmn", "dmn");

        const firstMove = handler.moveWidgetToSecondaryWindow(firstWidget);
        const secondMove = handler.moveWidgetToSecondaryWindow(secondWidget);
        await vi.waitFor(() => expect(finishFlushes).toHaveLength(2));

        finishFlushes[1](true);
        await vi.waitFor(() =>
            expect((handler as unknown as { windows: Window[] }).windows).toHaveLength(1),
        );
        finishFlushes[0](true);
        await vi.waitFor(() =>
            expect((handler as unknown as { windows: Window[] }).windows).toHaveLength(2),
        );

        const windows = (handler as unknown as { windows: Window[] }).windows;
        (handler as unknown as { closeWindow(window: Window): void }).closeWindow(windows[1]);
        await firstMove;

        expect(firstWidget.node.inert).toBe(false);
        expect(secondWidget.node.inert).toBe(true);

        (handler as unknown as { emitWillAdd(widget: unknown, window: Window): void }).emitWillAdd(
            secondWidget,
            windows[0],
        );
        await secondMove;
    });

    it("flushes pending edits before a detached modeler tab closes", async () => {
        let finishFlush: (success: boolean) => void = () => undefined;
        const executeCommand = vi
            .fn()
            .mockResolvedValueOnce(true)
            .mockImplementationOnce(
                () =>
                    new Promise<boolean>((resolve) => {
                        finishFlush = resolve;
                    }),
            );
        const handler = new ModelerSecondaryWindowHandler();
        Object.assign(handler, { commands: { executeCommand } });
        const widget = modelerWidget("bpmn-modeler.bpmn", "bpmn");
        const closeWithSaving = widget.closeWithSaving;

        await handler.moveWidgetToSecondaryWindow(widget);
        widget.close();
        await Promise.resolve();

        expect(executeCommand).toHaveBeenCalledTimes(2);
        expect(closeWithSaving).not.toHaveBeenCalled();
        expect(widget.node.inert).toBe(true);

        finishFlush(true);
        await vi.waitFor(() => expect(closeWithSaving).toHaveBeenCalledOnce());
        expect(widget.node.inert).toBe(false);
    });

    it("flushes pending edits before Ctrl+W closes a detached modeler", async () => {
        let finishFlush: (success: boolean) => void = () => undefined;
        const executeCommand = vi
            .fn()
            .mockResolvedValueOnce(true)
            .mockImplementationOnce(
                () =>
                    new Promise<boolean>((resolve) => {
                        finishFlush = resolve;
                    }),
            );
        const handler = new ModelerSecondaryWindowHandler();
        Object.assign(handler, { commands: { executeCommand } });
        const widget = modelerWidget("bpmn-modeler.dmn", "dmn");
        const closeWithSaving = widget.closeWithSaving;
        const closeOptions = { shouldSave: vi.fn().mockReturnValue(true) };

        await handler.moveWidgetToSecondaryWindow(widget);
        const closing = widget.closeWithSaving(closeOptions);
        await Promise.resolve();

        expect(executeCommand).toHaveBeenCalledTimes(2);
        expect(closeWithSaving).not.toHaveBeenCalled();
        expect(widget.node.inert).toBe(true);

        finishFlush(true);
        await closing;

        expect(closeWithSaving).toHaveBeenCalledWith(closeOptions);
        expect(widget.node.inert).toBe(false);
    });

    it("keeps a detached modeler open when its close flush cannot be confirmed", async () => {
        const executeCommand = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        const handler = new ModelerSecondaryWindowHandler();
        Object.assign(handler, { commands: { executeCommand } });
        const widget = modelerWidget("bpmn-modeler.bpmn", "bpmn");
        const closeWithSaving = widget.closeWithSaving;

        await handler.moveWidgetToSecondaryWindow(widget);
        await widget.closeWithSaving();

        expect(executeCommand).toHaveBeenCalledTimes(2);
        expect(closeWithSaving).not.toHaveBeenCalled();
        expect(widget.node.inert).toBe(false);
    });

    it("restores the normal close lifecycle after re-docking a modeler", async () => {
        const executeCommand = vi.fn().mockResolvedValue(true);
        const handler = new ModelerSecondaryWindowHandler();
        Object.assign(handler, { commands: { executeCommand } });
        const widget = modelerWidget("bpmn-modeler.bpmn", "bpmn");
        const close = widget.close;
        const closeWithSaving = widget.closeWithSaving;

        await handler.moveWidgetToSecondaryWindow(widget);
        expect(widget.close).not.toBe(close);
        expect(widget.closeWithSaving).not.toBe(closeWithSaving);

        (handler as unknown as { restoreWidget(candidate: unknown): void }).restoreWidget(widget);

        expect(widget.close).toBe(close);
        expect(widget.closeWithSaving).toBe(closeWithSaving);
        await widget.closeWithSaving();
        expect(executeCommand).toHaveBeenCalledOnce();
        expect(closeWithSaving).toHaveBeenCalledOnce();
    });

    it("extracts unrelated widgets without invoking the modeler command", async () => {
        const executeCommand = vi.fn();
        const handler = new ModelerSecondaryWindowHandler();
        Object.assign(handler, { commands: { executeCommand } });
        const widget = modelerWidget("text-editor", "txt");

        await handler.moveWidgetToSecondaryWindow(widget);

        expect(executeCommand).not.toHaveBeenCalled();
        expect((handler as unknown as { movedWidgets: unknown[] }).movedWidgets).toEqual([widget]);
        expect(widget.node.inert).toBe(false);
    });
});
