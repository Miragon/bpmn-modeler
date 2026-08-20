import type {
    FrontendApplication,
    FrontendApplicationContribution,
    OnWillStopAction,
    Widget,
} from "@theia/core/lib/browser";
import { CommonCommands } from "@theia/core/lib/browser/common-commands";
import { Saveable, ShouldSaveDialog } from "@theia/core/lib/browser/saveable";
import {
    getAllWidgetsFromSecondaryWindow,
    SecondaryWindowHandler,
} from "@theia/core/lib/browser/secondary-window-handler";
import { CommandRegistry } from "@theia/core/lib/common/command";
import { inject, injectable } from "@theia/core/shared/inversify";
import { ModelerSecondaryWindowHandler } from "./modeler-secondary-window-handler";
import { flushModelerWidget, isModelerWidget } from "./modeler-widget-flush";
import {
    quiesceModelerWidget,
    runModelerWidgetTransitions,
} from "./modeler-widget-lifecycle";

@injectable()
export class ModelerSecondaryWindowCloseContribution implements FrontendApplicationContribution {
    @inject(CommandRegistry)
    protected readonly commands!: CommandRegistry;

    @inject(SecondaryWindowHandler)
    protected readonly secondaryWindowHandler!: ModelerSecondaryWindowHandler;

    onStart(): void {
        this.commands.registerHandler(CommonCommands.CLOSE_MAIN_TAB.id, {
            isEnabled: () => this.focusedSecondaryWidget()?.title.closable === true,
            execute: () => {
                const widget = this.focusedSecondaryWidget();
                if (widget?.title.closable) {
                    widget.close();
                }
            },
        });
    }

    onWillStop(app: FrontendApplication): OnWillStopAction | undefined {
        const widgets = [
            ...new Set([
                ...this.secondaryWindowHandler.modelerWidgets,
                ...app.shell.widgets.filter(isModelerWidget),
            ]),
        ];
        if (widgets.length === 0) {
            return undefined;
        }
        const hadDirtyEditors = app.shell.canSaveAll();
        return {
            reason: "Pending modeler changes",
            prepare: () => this.flushModelers(widgets),
            action: async (prepared) => {
                if (prepared !== true) {
                    return false;
                }
                if (hadDirtyEditors) {
                    return this.flushModelers(widgets, () => this.confirmDirtyModelers(widgets));
                }
                return this.flushModelers(widgets, () => this.confirmDirtyModelers(widgets));
            },
        };
    }

    private async flushModelers(
        widgets: Widget[],
        afterFlush: () => Promise<boolean> = async () => true,
    ): Promise<boolean> {
        const releaseInteraction = widgets.map(quiesceModelerWidget);
        try {
            return await runModelerWidgetTransitions(widgets, async () => {
                try {
                    const flushed = await Promise.all(
                        widgets.map((widget) =>
                            widget.isDisposed ? true : flushModelerWidget(this.commands, widget),
                        ),
                    );
                    return flushed.includes(false) ? false : await afterFlush();
                } catch {
                    return false;
                }
            });
        } finally {
            releaseInteraction.reverse().forEach((release) => release());
        }
    }

    private async confirmDirtyModelers(widgets: Widget[]): Promise<boolean> {
        for (const widget of widgets) {
            if (widget.isDisposed || !Saveable.isDirty(widget)) {
                continue;
            }
            const shouldSave = await new ShouldSaveDialog(widget).open();
            if (shouldSave === undefined) {
                return false;
            }
            if (shouldSave) {
                await Saveable.save(widget);
                if (Saveable.isDirty(widget)) {
                    return false;
                }
            }
        }
        return true;
    }

    private focusedSecondaryWidget(): Widget | undefined {
        const focusedWindow = this.secondaryWindowHandler.getFocusedWindow();
        if (!focusedWindow || focusedWindow === window) {
            return undefined;
        }

        const firstWidget = getAllWidgetsFromSecondaryWindow(focusedWindow)?.[0];
        if (!firstWidget) {
            return undefined;
        }
        return this.secondaryWindowHandler.getTabBarFor(firstWidget)?.currentTitle?.owner;
    }
}
