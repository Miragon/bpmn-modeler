import type { ExtractableWidget, SaveableWidget, Widget } from "@theia/core/lib/browser";
import { SecondaryWindowHandler } from "@theia/core/lib/browser/secondary-window-handler";
import type { TheiaDockPanel } from "@theia/core/lib/browser/shell/theia-dock-panel";
import { CommandService } from "@theia/core/lib/common/command";
import { inject, injectable } from "@theia/core/shared/inversify";
import { flushModelerWidget, isModelerWidget } from "./modeler-widget-flush";
import {
    quiesceModelerWidget,
    registerModelerWidgetOwnershipRestorer,
    runModelerWidgetTransition,
} from "./modeler-widget-lifecycle";

const SECONDARY_WINDOW_RELOCATION_TIMEOUT_MS = 5_000;

@injectable()
export class ModelerSecondaryWindowHandler extends SecondaryWindowHandler {
    @inject(CommandService)
    protected readonly commands!: CommandService;

    private readonly closeGuardRestorers = new Map<Widget, () => void>();
    private readonly extractionWindows = new Map<Widget, Window>();

    get modelerWidgets(): ReadonlyArray<Widget> {
        return [...new Set([...this.widgets, ...this.closeGuardRestorers.keys()])].filter(
            (widget) => !widget.isDisposed && isModelerWidget(widget),
        );
    }

    override async moveWidgetToSecondaryWindow(widget: ExtractableWidget): Promise<void> {
        if (!isModelerWidget(widget)) {
            super.moveWidgetToSecondaryWindow(widget);
            return;
        }

        this.installCloseGuard(widget);
        const releaseInteraction = quiesceModelerWidget(widget);
        let interactionRestored = false;
        let finishInteraction: () => void = () => undefined;
        const interactionFinished = new Promise<void>((resolve) => {
            finishInteraction = resolve;
        });
        let addListener: { dispose(): void } | undefined;
        let closeListener: { dispose(): void } | undefined;
        const restoreInteraction = (disposeCloseListener = true): void => {
            if (interactionRestored) {
                return;
            }
            interactionRestored = true;
            releaseInteraction();
            finishInteraction();
            addListener?.dispose();
            if (disposeCloseListener) {
                closeListener?.dispose();
            }
        };

        return runModelerWidgetTransition(widget, async () => {
            try {
                if (widget.isDisposed) {
                    this.restoreCloseGuard(widget);
                    restoreInteraction();
                    return;
                }
                const pendingWindow = this.extractionWindows.get(widget);
                if (pendingWindow && !pendingWindow.closed) {
                    pendingWindow.close();
                    restoreInteraction();
                    return;
                }
                if (pendingWindow) {
                    this.extractionWindows.delete(widget);
                }
                if (widget.secondaryWindow !== undefined) {
                    restoreInteraction();
                    return;
                }
                this.installCloseGuard(widget);
                if (!(await flushModelerWidget(this.commands, widget))) {
                    restoreInteraction();
                    return;
                }

                let expectedWindow: Window | undefined;
                let addedWindow: Window | undefined;
                addListener = this.onWillAddWidget(([candidate, candidateWindow]) => {
                    if (candidate === widget) {
                        addedWindow = candidateWindow;
                    }
                    if (candidate === widget && candidateWindow === expectedWindow) {
                        this.extractionWindows.delete(widget);
                        restoreInteraction();
                    }
                });
                const windowsBefore = new Set(this.secondaryWindowService.getWindows());
                super.moveWidgetToSecondaryWindow(widget);
                if (interactionRestored) {
                    return;
                }

                const newWindow = this.secondaryWindowService
                    .getWindows()
                    .find((candidate) => !windowsBefore.has(candidate));
                if (!newWindow) {
                    restoreInteraction();
                    return;
                }
                expectedWindow = newWindow;
                this.extractionWindows.set(widget, newWindow);
                if (addedWindow === newWindow) {
                    this.extractionWindows.delete(widget);
                    restoreInteraction();
                    return;
                }
                closeListener = this.secondaryWindowService.onWindowClosed((closedWindow) => {
                    if (closedWindow === newWindow) {
                        if (this.extractionWindows.get(widget) === newWindow) {
                            this.extractionWindows.delete(widget);
                        }
                        closeListener?.dispose();
                        this.restoreCloseGuard(widget);
                        restoreInteraction();
                    }
                });
                let relocationTimer: ReturnType<typeof setTimeout> | undefined;
                await Promise.race([
                    interactionFinished,
                    new Promise<void>((resolve) => {
                        relocationTimer = setTimeout(
                            resolve,
                            SECONDARY_WINDOW_RELOCATION_TIMEOUT_MS,
                        );
                    }),
                ]);
                clearTimeout(relocationTimer);
                if (!interactionRestored) {
                    newWindow.close();
                    restoreInteraction(false);
                }
            } catch (error) {
                restoreInteraction();
                throw error;
            }
        });
    }

    override addWidgetToSecondaryWindow(
        widget: Widget,
        _secondaryWindow: Window,
        options?: TheiaDockPanel.AddOptions,
    ): void {
        if (!isModelerWidget(widget)) {
            super.addWidgetToSecondaryWindow(widget, _secondaryWindow, options);
            return;
        }

        if ((widget as Widget & { secondaryWindow?: Window }).secondaryWindow) {
            return;
        }
        this.applicationShell.mainPanel.addWidget(widget, { ...options, ref: undefined });
    }

    protected override removeWidget(widget: Widget, win: Window): void {
        this.extractionWindows.delete(widget);
        this.restoreCloseGuard(widget);
        super.removeWidget(widget, win);
    }

    private installCloseGuard(widget: Widget): void {
        if (!isModelerWidget(widget)) {
            return;
        }
        registerModelerWidgetOwnershipRestorer(widget, (secondaryWindow) => {
            this.installCloseGuard(widget);
            this.addWidget(widget, secondaryWindow);
        });
        if (!this.isSaveableWidget(widget) || this.closeGuardRestorers.has(widget)) {
            return;
        }

        const originalClose = widget.close;
        const originalCloseWithSaving = widget.closeWithSaving;
        let pendingClose: Promise<void> | undefined;
        const guardedCloseWithSaving = (options?: SaveableWidget.CloseOptions): Promise<void> => {
            if (!pendingClose) {
                pendingClose = this.flushThenClose(
                    widget,
                    originalCloseWithSaving,
                    options,
                ).finally(() => {
                    pendingClose = undefined;
                });
            }
            return pendingClose;
        };
        const guardedClose = (): void => {
            void guardedCloseWithSaving();
        };

        widget.close = guardedClose;
        widget.closeWithSaving = guardedCloseWithSaving;
        const onDisposed = (): void => this.restoreCloseGuard(widget);
        widget.disposed?.connect(onDisposed);
        this.closeGuardRestorers.set(widget, () => {
            widget.disposed?.disconnect(onDisposed);
            if (widget.close === guardedClose) {
                widget.close = originalClose;
            }
            if (widget.closeWithSaving === guardedCloseWithSaving) {
                widget.closeWithSaving = originalCloseWithSaving;
            }
        });
    }

    private restoreCloseGuard(widget: Widget): void {
        this.closeGuardRestorers.get(widget)?.();
        this.closeGuardRestorers.delete(widget);
    }

    private isSaveableWidget(widget: Widget): widget is SaveableWidget {
        return "closeWithoutSaving" in widget && "closeWithSaving" in widget;
    }

    private async flushThenClose(
        widget: Widget,
        closeWithSaving: SaveableWidget["closeWithSaving"],
        options?: SaveableWidget.CloseOptions,
    ): Promise<void> {
        return runModelerWidgetTransition(widget, async () => {
            const releaseInteraction = quiesceModelerWidget(widget);
            try {
                if (!widget.isDisposed && (await flushModelerWidget(this.commands, widget))) {
                    await closeWithSaving.call(widget, options);
                }
            } finally {
                releaseInteraction();
            }
        });
    }
}
