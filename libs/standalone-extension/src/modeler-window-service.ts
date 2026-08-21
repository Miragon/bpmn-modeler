import type { Widget } from "@theia/core/lib/browser";
import { WidgetManager } from "@theia/core/lib/browser/widget-manager";
import type { StopReason } from "@theia/core/lib/common/frontend-application-state";
import { CommandRegistry } from "@theia/core/lib/common/command";
import { ElectronWindowService } from "@theia/core/lib/electron-browser/window/electron-window-service";
import { inject, injectable } from "@theia/core/shared/inversify";
import {
    flushModelerWidget,
    isModelerWidget,
    MODELER_CUSTOM_EDITOR_FACTORY_ID,
} from "./modeler-widget-flush";
import { quiesceModelerWidget, runModelerWidgetTransitions } from "./modeler-widget-lifecycle";

@injectable()
export class ModelerWindowService extends ElectronWindowService {
    @inject(CommandRegistry)
    protected readonly commands!: CommandRegistry;

    @inject(WidgetManager)
    protected readonly widgetManager!: WidgetManager;

    override async isSafeToShutDown(stopReason: StopReason): Promise<boolean> {
        const widgets = this.widgetManager
            .getWidgets(MODELER_CUSTOM_EDITOR_FACTORY_ID)
            .filter((widget) => !widget.isDisposed && isModelerWidget(widget));
        return this.flushModelers(widgets, () => super.isSafeToShutDown(stopReason));
    }

    private async flushModelers(
        widgets: Widget[],
        afterFlush: () => Promise<boolean>,
    ): Promise<boolean> {
        const releaseInteraction = widgets.map(quiesceModelerWidget);
        try {
            return await runModelerWidgetTransitions(widgets, async () => {
                try {
                    const flushed = await Promise.all(
                        widgets.map((widget) => flushModelerWidget(this.commands, widget)),
                    );
                    return flushed.includes(false) ? false : afterFlush();
                } catch {
                    return false;
                }
            });
        } finally {
            releaseInteraction.reverse().forEach((release) => release());
        }
    }
}
