import { describe, expect, it, vi } from "vitest";

vi.mock("@theia/core/lib/electron-browser/window/electron-secondary-window-service", () => ({
    ElectronSecondaryWindowService: class {
        protected readonly beforeWidgetRestoreEmitter = { fire: vi.fn() };
        protected readonly electronWindowPreferences = { get: vi.fn().mockReturnValue(0) };
        protected readonly onWindowClosedEmitter = { fire: vi.fn() };
        protected readonly secondaryWindows: Window[] = [];
        private nextWindow = 1;
        private readonly windowLoadedListeners: Array<(window: Window) => void> = [];

        readonly onWindowLoaded = (listener: (window: Window) => void) => {
            this.windowLoadedListeners.push(listener);
            return { dispose: vi.fn() };
        };

        createSecondaryWindow(): Window {
            const listeners = new Map<string, EventListener[]>();
            const secondaryWindow = {
                addEventListener: vi.fn((type: string, listener: EventListener) => {
                    const eventListeners = listeners.get(type) ?? [];
                    eventListeners.push(listener);
                    listeners.set(type, eventListeners);
                }),
                dispatchEvent: vi.fn((event: Event) => {
                    for (const listener of listeners.get(event.type) ?? []) {
                        listener(event);
                    }
                    return !event.defaultPrevented;
                }),
                name: `secondary-window-${this.nextWindow++}`,
            } as unknown as Window;
            this.secondaryWindows.push(secondaryWindow);
            return secondaryWindow;
        }

        getWindows(): Window[] {
            return this.secondaryWindows;
        }

        protected emitWindowLoaded(secondaryWindow: Window): void {
            this.windowLoadedListeners.forEach((listener) => listener(secondaryWindow));
            secondaryWindow.addEventListener("beforeunload", vi.fn(), { capture: true });
            secondaryWindow.addEventListener("pagehide", () => {
                const index = this.secondaryWindows.indexOf(secondaryWindow);
                if (index >= 0) {
                    this.onWindowClosedEmitter.fire(secondaryWindow);
                    this.secondaryWindows.splice(index, 1);
                }
            });
        }

        protected async restoreWidgets(
            _secondaryWindow: Window,
            widget: unknown,
            shell: {
                addWidget(candidate: unknown): Promise<void>;
                activateWidget(id: string): Promise<void>;
            },
        ): Promise<boolean> {
            await shell.addWidget(widget);
            await shell.activateWidget((widget as { id: string }).id);
            return true;
        }
    },
}));

vi.mock("@theia/core/lib/browser/secondary-window-handler", () => ({
    extractSecondaryWindow: (widget: { secondaryWindow?: Window }) => widget.secondaryWindow,
    getAllWidgetsFromSecondaryWindow: (secondaryWindow: Window & { widgets?: unknown[] }) =>
        secondaryWindow.widgets,
    getDefaultRestoreArea: () => undefined,
}));

vi.mock("@theia/core/lib/browser/saveable", () => ({
    Saveable: {
        isDirty: (widget: { dirty?: boolean }) => widget.dirty === true,
    },
}));

import type { ApplicationShell, ExtractableWidget } from "@theia/core/lib/browser";
import { ModelerSecondaryWindowService } from "./modeler-secondary-window-service";
import { registerModelerWidgetOwnershipRestorer } from "./modeler-widget-lifecycle";

class TestModelerSecondaryWindowService extends ModelerSecondaryWindowService {
    restore(
        secondaryWindow: Window,
        widget: ExtractableWidget,
        shell: ApplicationShell,
    ): Promise<boolean> {
        return this.restoreWidgets(secondaryWindow, widget, shell);
    }

    loaded(secondaryWindow: Window, widget: ExtractableWidget, shell: ApplicationShell): void {
        (
            this as unknown as {
                emitWindowLoaded: (window: Window) => void;
            }
        ).emitWindowLoaded(secondaryWindow);
        this.windowCreated(secondaryWindow, widget, shell);
    }
}

function modelerWidget(viewType: string, extension: string): ExtractableWidget {
    return {
        id: "modeler",
        isDisposed: false,
        isExtractable: true,
        previousArea: "main",
        resource: { toString: () => `file:///process.${extension}` },
        secondaryWindow: {} as Window,
        viewType,
        node: { inert: false },
    } as unknown as ExtractableWidget;
}

describe("ModelerSecondaryWindowService", () => {
    it("registers and cleans up the native close responder before document load", async () => {
        const previousElectronApi = (window as unknown as { electronTheiaCore?: unknown })
            .electronTheiaCore;
        const electronTheiaCore = {
            setMenuBarVisible: vi.fn(),
            setSecondaryWindowCloseRequestHandler: vi.fn(),
            setZoomLevel: vi.fn(),
        };
        (window as unknown as { electronTheiaCore: unknown }).electronTheiaCore = electronTheiaCore;
        try {
            const service = new TestModelerSecondaryWindowService();
            Object.assign(service, {
                commands: { executeCommand: vi.fn().mockResolvedValue(true) },
            });
            const widget = modelerWidget("bpmn-modeler.bpmn", "bpmn");
            const shell = {
                addWidget: vi.fn().mockResolvedValue(undefined),
                activateWidget: vi.fn().mockResolvedValue(undefined),
                closeWidget: vi.fn().mockResolvedValue(undefined),
            } as unknown as ApplicationShell;

            service.createSecondaryWindow(widget, shell);

            expect(electronTheiaCore.setSecondaryWindowCloseRequestHandler).toHaveBeenCalledOnce();
            expect(electronTheiaCore.setSecondaryWindowCloseRequestHandler).toHaveBeenCalledWith(
                "secondary-window-1",
                expect.any(Function),
            );
            const closeHandler = electronTheiaCore.setSecondaryWindowCloseRequestHandler.mock
                .calls[0][1] as () => Promise<boolean>;

            await expect(closeHandler()).resolves.toBe(true);
            expect(service.getWindows()).toEqual([]);

            const nextWindow = service.createSecondaryWindow(widget, shell)!;
            service.loaded(nextWindow, widget, shell);

            expect(electronTheiaCore.setSecondaryWindowCloseRequestHandler).toHaveBeenCalledTimes(
                2,
            );
            expect(electronTheiaCore.setMenuBarVisible).toHaveBeenCalledWith(
                false,
                "secondary-window-2",
            );
            expect(electronTheiaCore.setZoomLevel).toHaveBeenCalledWith(0, "secondary-window-2");

            const loadedCloseHandler = electronTheiaCore.setSecondaryWindowCloseRequestHandler.mock
                .calls[1][1] as () => Promise<boolean>;
            await expect(loadedCloseHandler()).resolves.toBe(true);
            expect(service.getWindows()).toEqual([nextWindow]);

            nextWindow.dispatchEvent(new Event("pagehide"));
            expect(service.getWindows()).toEqual([]);
        } finally {
            (window as unknown as { electronTheiaCore?: unknown }).electronTheiaCore =
                previousElectronApi;
        }
    });

    it("ignores stale dirty root entries after their widget has been re-docked", () => {
        const previousElectronApi = (window as unknown as { electronTheiaCore?: unknown })
            .electronTheiaCore;
        (window as unknown as { electronTheiaCore: unknown }).electronTheiaCore = {
            setMenuBarVisible: vi.fn(),
            setSecondaryWindowCloseRequestHandler: vi.fn(),
            setZoomLevel: vi.fn(),
        };
        try {
            const service = new TestModelerSecondaryWindowService();
            const widget = Object.assign(modelerWidget("bpmn-modeler.bpmn", "bpmn"), {
                dirty: true,
            });
            const shell = {} as ApplicationShell;
            const secondaryWindow = service.createSecondaryWindow(widget, shell)! as Window & {
                widgets: ExtractableWidget[];
            };
            secondaryWindow.widgets = [widget];
            widget.secondaryWindow = secondaryWindow;
            service.loaded(secondaryWindow, widget, shell);
            const beforeUnloadListener = vi
                .mocked(secondaryWindow.addEventListener)
                .mock.calls.find(([type]) => type === "beforeunload")?.[1] as EventListener;
            const event = {
                stopImmediatePropagation: vi.fn(),
            } as unknown as BeforeUnloadEvent;

            beforeUnloadListener(event);
            expect(event.stopImmediatePropagation).not.toHaveBeenCalled();

            widget.secondaryWindow = undefined;
            beforeUnloadListener(event);

            expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
        } finally {
            (window as unknown as { electronTheiaCore?: unknown }).electronTheiaCore =
                previousElectronApi;
        }
    });

    it.each([
        ["bpmn-modeler.bpmn", "bpmn"],
        ["bpmn-modeler.dmn", "dmn"],
    ])("waits for a pending %s flush before restoring the widget", async (viewType, extension) => {
        let finishFlush: (success: boolean) => void = () => undefined;
        const executeCommand = vi.fn(
            () =>
                new Promise<boolean>((resolve) => {
                    finishFlush = resolve;
                }),
        );
        const addWidget = vi.fn().mockResolvedValue(undefined);
        const service = new TestModelerSecondaryWindowService();
        Object.assign(service, { commands: { executeCommand } });
        const widget = modelerWidget(viewType, extension);

        const restoring = service.restore({ rootWidget: undefined } as unknown as Window, widget, {
            addWidget,
            activateWidget: vi.fn().mockResolvedValue(undefined),
        } as never);
        await Promise.resolve();

        expect(executeCommand).toHaveBeenCalledWith(
            "bpmn-modeler.flushDocument",
            `file:///process.${extension}`,
            viewType,
        );
        expect(addWidget).not.toHaveBeenCalled();
        expect(widget.node.inert).toBe(true);

        finishFlush(true);
        await restoring;

        expect(addWidget).toHaveBeenCalledOnce();
        expect(widget.node.inert).toBe(false);
    });

    it("keeps the secondary window open when the host cannot confirm the flush", async () => {
        const addWidget = vi.fn().mockResolvedValue(undefined);
        const service = new TestModelerSecondaryWindowService();
        Object.assign(service, {
            commands: { executeCommand: vi.fn().mockResolvedValue(false) },
        });
        const widget = modelerWidget("bpmn-modeler.bpmn", "bpmn");

        await expect(
            service.restore({ rootWidget: undefined } as unknown as Window, widget, {
                addWidget,
                activateWidget: vi.fn().mockResolvedValue(undefined),
            } as never),
        ).resolves.toBe(false);

        expect(addWidget).not.toHaveBeenCalled();
        expect(widget.node.inert).toBe(false);
    });

    it("deduplicates overlapping native restore requests for the same window", async () => {
        const finishFlushes: Array<(success: boolean) => void> = [];
        const executeCommand = vi.fn(
            () =>
                new Promise<boolean>((resolve) => {
                    finishFlushes.push(resolve);
                }),
        );
        const addWidget = vi.fn().mockResolvedValue(undefined);
        const shell = {
            addWidget,
            activateWidget: vi.fn().mockResolvedValue(undefined),
        } as never;
        const service = new TestModelerSecondaryWindowService();
        Object.assign(service, { commands: { executeCommand } });
        const widget = modelerWidget("bpmn-modeler.bpmn", "bpmn");
        const secondaryWindow = { rootWidget: undefined } as unknown as Window;

        const firstRestore = service.restore(secondaryWindow, widget, shell);
        const secondRestore = service.restore(secondaryWindow, widget, shell);
        await vi.waitFor(() => expect(executeCommand).toHaveBeenCalledOnce());

        finishFlushes[0](true);
        await Promise.all([firstRestore, secondRestore]);

        expect(widget.node.inert).toBe(false);
        expect(executeCommand).toHaveBeenCalledOnce();
        expect(addWidget).toHaveBeenCalledOnce();
    });

    it("leaves a widget added during restore in the secondary window", async () => {
        let finishAdd: () => void = () => undefined;
        const addWidget = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    finishAdd = resolve;
                }),
        );
        const service = new TestModelerSecondaryWindowService();
        Object.assign(service, {
            commands: { executeCommand: vi.fn().mockResolvedValue(true) },
        });
        const firstWidget = modelerWidget("bpmn-modeler.bpmn", "bpmn");
        const lateWidget = modelerWidget("bpmn-modeler.dmn", "dmn");
        const secondaryWindow = { widgets: [firstWidget] } as unknown as Window;
        firstWidget.secondaryWindow = secondaryWindow;
        lateWidget.secondaryWindow = secondaryWindow;

        const restoring = service.restore(secondaryWindow, firstWidget, {
            addWidget,
            activateWidget: vi.fn().mockResolvedValue(undefined),
            closeWidget: vi.fn().mockResolvedValue(undefined),
        } as never);
        await vi.waitFor(() => expect(addWidget).toHaveBeenCalledOnce());
        (secondaryWindow as unknown as { widgets: ExtractableWidget[] }).widgets.push(lateWidget);
        finishAdd();

        await expect(restoring).resolves.toBe(false);
        expect(firstWidget.secondaryWindow).toBeUndefined();
        expect(lateWidget.secondaryWindow).toBe(secondaryWindow);
    });

    it("preserves secondary ownership when re-docking fails", async () => {
        const service = new TestModelerSecondaryWindowService();
        Object.assign(service, {
            commands: { executeCommand: vi.fn().mockResolvedValue(true) },
        });
        const widget = modelerWidget("bpmn-modeler.bpmn", "bpmn");
        const secondaryWindow = { widgets: [widget] } as unknown as Window;
        widget.secondaryWindow = secondaryWindow;
        const closeWidget = vi.fn().mockResolvedValue(undefined);
        const restoreOwnership = vi.fn();
        registerModelerWidgetOwnershipRestorer(widget, restoreOwnership);

        await expect(
            service.restore(secondaryWindow, widget, {
                addWidget: vi.fn().mockRejectedValue(new Error("cannot re-dock")),
                activateWidget: vi.fn(),
                closeWidget,
            } as never),
        ).resolves.toBe(false);

        expect(widget.secondaryWindow).toBe(secondaryWindow);
        expect(widget.previousArea).toBe("main");
        expect(restoreOwnership).toHaveBeenCalledWith(secondaryWindow);
        expect(closeWidget).not.toHaveBeenCalled();
    });

    it("removes secondary ownership before adding a widget back to the shell", async () => {
        const service = new TestModelerSecondaryWindowService();
        Object.assign(service, {
            commands: { executeCommand: vi.fn().mockResolvedValue(true) },
        });
        const widget = modelerWidget("bpmn-modeler.bpmn", "bpmn");
        const secondaryWindow = { widgets: [widget] } as unknown as Window;
        widget.secondaryWindow = secondaryWindow;
        const beforeRestore = vi.fn();
        (
            service as unknown as {
                beforeWidgetRestoreEmitter: { fire: (value: unknown) => void };
            }
        ).beforeWidgetRestoreEmitter.fire = beforeRestore;
        const addWidget = vi.fn(async () => {
            expect(beforeRestore).toHaveBeenCalledWith([widget, secondaryWindow]);
        });

        await expect(
            service.restore(secondaryWindow, widget, {
                addWidget,
                activateWidget: vi.fn().mockResolvedValue(undefined),
                closeWidget: vi.fn().mockResolvedValue(undefined),
            } as never),
        ).resolves.toBe(true);

        expect(addWidget).toHaveBeenCalledOnce();
    });

    it("restores unrelated widgets without invoking the modeler command", async () => {
        const executeCommand = vi.fn();
        const addWidget = vi.fn().mockResolvedValue(undefined);
        const service = new TestModelerSecondaryWindowService();
        Object.assign(service, { commands: { executeCommand } });

        await service.restore(
            { rootWidget: undefined } as unknown as Window,
            modelerWidget("text-editor", "txt"),
            { addWidget, activateWidget: vi.fn().mockResolvedValue(undefined) } as never,
        );

        expect(executeCommand).not.toHaveBeenCalled();
        expect(addWidget).toHaveBeenCalledOnce();
    });
});
