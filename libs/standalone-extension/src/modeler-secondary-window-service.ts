import type { ApplicationShell, ExtractableWidget, Widget } from "@theia/core/lib/browser";
import { Saveable } from "@theia/core/lib/browser/saveable";
import type { SecondaryWindow } from "@theia/core/lib/browser/window/secondary-window-service";
import {
    extractSecondaryWindow,
    getAllWidgetsFromSecondaryWindow,
    getDefaultRestoreArea,
} from "@theia/core/lib/browser/secondary-window-handler";
import { ElectronSecondaryWindowService } from "@theia/core/lib/electron-browser/window/electron-secondary-window-service";
import { CommandService } from "@theia/core/lib/common/command";
import type { TheiaCoreAPI } from "@theia/core/lib/electron-common/electron-api";
import { PREF_WINDOW_ZOOM_LEVEL } from "@theia/core/lib/electron-common/electron-window-preferences";
import { inject, injectable } from "@theia/core/shared/inversify";
import { flushModelerWidget, isModelerWidget } from "./modeler-widget-flush";
import {
    quiesceModelerWidget,
    restoreModelerWidgetOwnership,
    runModelerWidgetTransitions,
} from "./modeler-widget-lifecycle";

@injectable()
export class ModelerSecondaryWindowService extends ElectronSecondaryWindowService {
    @inject(CommandService)
    protected readonly commands!: CommandService;

    private readonly pendingRestores = new WeakMap<Window, Promise<boolean>>();
    private readonly loadedWindows = new WeakSet<Window>();
    private readonly initialWidgets = new WeakMap<Window, ExtractableWidget>();

    constructor() {
        super();
        this.onWindowLoaded((newWindow) => {
            this.loadedWindows.add(newWindow);
            newWindow.addEventListener(
                "beforeunload",
                (event) => {
                    const initialWidget = this.initialWidgets.get(newWindow);
                    const widgets =
                        getAllWidgetsFromSecondaryWindow(newWindow) ??
                        (initialWidget ? [initialWidget] : []);
                    const dirtyWidgets = widgets.filter((widget) => Saveable.isDirty(widget));
                    const hasOwnedDirtyWidget = dirtyWidgets.some(
                        (widget) => extractSecondaryWindow(widget) === newWindow,
                    );
                    if (dirtyWidgets.length > 0 && !hasOwnedDirtyWidget) {
                        event.stopImmediatePropagation();
                    }
                },
                { capture: true },
            );
        });
    }

    private get electronTheiaCore(): TheiaCoreAPI {
        return (window as Window & { electronTheiaCore: TheiaCoreAPI }).electronTheiaCore;
    }

    override createSecondaryWindow(
        widget: ExtractableWidget,
        shell: ApplicationShell,
    ): Window | SecondaryWindow | undefined {
        const newWindow = super.createSecondaryWindow(widget, shell);
        if (newWindow) {
            this.initialWidgets.set(newWindow, widget);
            // A stalled about:blank popup must still be able to answer Electron's close request.
            this.electronTheiaCore.setSecondaryWindowCloseRequestHandler(newWindow.name, () =>
                this.canCloseSecondaryWindow(newWindow, widget, shell),
            );
        }
        return newWindow;
    }

    protected override windowCreated(
        newWindow: Window,
        _widget: ExtractableWidget,
        _shell: ApplicationShell,
    ): void {
        this.electronTheiaCore.setMenuBarVisible(false, newWindow.name);
        const zoomLevel = this.electronWindowPreferences.get(PREF_WINDOW_ZOOM_LEVEL, 0);
        this.electronTheiaCore.setZoomLevel(zoomLevel, newWindow.name);
    }

    private async canCloseSecondaryWindow(
        newWindow: Window,
        widget: ExtractableWidget,
        shell: ApplicationShell,
    ): Promise<boolean> {
        const canClose = await this.restoreWidgets(newWindow, widget, shell);
        if (canClose && !this.loadedWindows.has(newWindow)) {
            const index = this.secondaryWindows.indexOf(newWindow);
            if (index >= 0) {
                this.onWindowClosedEmitter.fire(newWindow);
                this.secondaryWindows.splice(index, 1);
            }
        }
        return canClose;
    }

    protected override restoreWidgets(
        newWindow: Window,
        extractableWidget: ExtractableWidget,
        shell: ApplicationShell,
    ): Promise<boolean> {
        const pending = this.pendingRestores.get(newWindow);
        if (pending) {
            return pending;
        }

        const restoring = this.restoreWidgetsOnce(newWindow, extractableWidget, shell);
        this.pendingRestores.set(newWindow, restoring);
        void restoring.then(
            () => this.clearPendingRestore(newWindow, restoring),
            () => this.clearPendingRestore(newWindow, restoring),
        );
        return restoring;
    }

    private async restoreWidgetsOnce(
        newWindow: Window,
        extractableWidget: ExtractableWidget,
        shell: ApplicationShell,
    ): Promise<boolean> {
        const widgets = this.widgetsInWindow(newWindow, extractableWidget);
        const modelerWidgets = widgets.filter(
            (widget) => !widget.isDisposed && isModelerWidget(widget),
        );
        return runModelerWidgetTransitions(modelerWidgets, async () => {
            const releaseInteraction = modelerWidgets.map(quiesceModelerWidget);
            try {
                if (
                    !this.sameWidgets(widgets, this.widgetsInWindow(newWindow, extractableWidget))
                ) {
                    return false;
                }
                const flushed = await Promise.all(
                    widgets.map((widget) =>
                        widget.isDisposed ? true : flushModelerWidget(this.commands, widget),
                    ),
                );
                if (flushed.includes(false)) {
                    return false;
                }
                if (
                    !this.sameWidgets(widgets, this.widgetsInWindow(newWindow, extractableWidget))
                ) {
                    return false;
                }
                const restored = await this.restoreWidgetSnapshot(newWindow, widgets, shell);
                const remainingWidgets = this.widgetsInWindow(newWindow, extractableWidget);
                return restored && remainingWidgets.every((widget) => widgets.includes(widget));
            } finally {
                releaseInteraction.reverse().forEach((release) => release());
            }
        });
    }

    private widgetsInWindow(newWindow: Window, extractableWidget: ExtractableWidget): Widget[] {
        const widgets = getAllWidgetsFromSecondaryWindow(newWindow);
        if (!widgets) {
            return extractableWidget.isDisposed ? [] : [extractableWidget];
        }
        return widgets.filter(
            (widget) => !widget.isDisposed && extractSecondaryWindow(widget) === newWindow,
        );
    }

    private sameWidgets(left: Widget[], right: Widget[]): boolean {
        return left.length === right.length && left.every((widget) => right.includes(widget));
    }

    private async restoreWidgetSnapshot(
        newWindow: Window,
        widgets: Widget[],
        shell: ApplicationShell,
    ): Promise<boolean> {
        const defaultRestoreArea = getDefaultRestoreArea(newWindow);
        let allMovedOrDisposed = true;
        // Theia iterates the live window array; use the flushed snapshot so a late tab stays put.
        for (const widget of widgets) {
            if (widget.isDisposed) {
                continue;
            }
            const extractable = this.isExtractableWidget(widget);
            const previousSecondaryWindow = extractable ? widget.secondaryWindow : undefined;
            const previousArea = extractable ? widget.previousArea : undefined;
            let added = false;
            try {
                const preferredRestoreArea = extractable ? previousArea : defaultRestoreArea;
                const area =
                    preferredRestoreArea === undefined ||
                    preferredRestoreArea === "top" ||
                    preferredRestoreArea === "secondaryWindow"
                        ? "main"
                        : preferredRestoreArea;
                this.beforeWidgetRestoreEmitter.fire([widget, newWindow]);
                if (extractable) {
                    widget.secondaryWindow = undefined;
                    widget.previousArea = undefined;
                }
                await shell.addWidget(widget, { area });
                added = true;
                await shell.activateWidget(widget.id);
            } catch {
                if (!added) {
                    if (extractable) {
                        widget.secondaryWindow = previousSecondaryWindow;
                        widget.previousArea = previousArea;
                    }
                    if (isModelerWidget(widget)) {
                        restoreModelerWidgetOwnership(widget, newWindow);
                        allMovedOrDisposed = false;
                        continue;
                    }
                }
                await shell.closeWidget(widget.id);
                if (!widget.isDisposed) {
                    allMovedOrDisposed = false;
                }
            }
        }
        return allMovedOrDisposed;
    }

    private isExtractableWidget(widget: Widget): widget is ExtractableWidget {
        return "isExtractable" in widget && widget.isExtractable === true;
    }

    private clearPendingRestore(newWindow: Window, restoring: Promise<boolean>): void {
        if (this.pendingRestores.get(newWindow) === restoring) {
            this.pendingRestores.delete(newWindow);
        }
    }
}
