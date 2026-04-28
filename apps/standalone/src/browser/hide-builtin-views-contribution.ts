import { inject, injectable } from "@theia/core/shared/inversify";
import { FrontendApplication, FrontendApplicationContribution } from "@theia/core/lib/browser";
import { WidgetManager } from "@theia/core/lib/browser/widget-manager";

// IDs are Theia internals verified against 1.70.x — re-check on version upgrades.
const HIDDEN_VIEW_CONTAINER_IDS = [
    "vsx-extensions",
    "debug",
    "test-view-container",
    "outline-view",
];

@injectable()
export class HideBuiltinViewsContribution implements FrontendApplicationContribution {
    @inject(WidgetManager)
    protected readonly widgetManager!: WidgetManager;

    async onDidInitializeLayout(app: FrontendApplication): Promise<void> {
        await Promise.all(
            HIDDEN_VIEW_CONTAINER_IDS.map((id) => this.hideWidget(app, id)),
        );
    }

    private async hideWidget(app: FrontendApplication, id: string): Promise<void> {
        const widget =
            app.shell.getWidgetById(id) ??
            (await this.widgetManager.tryGetWidget(id));
        widget?.dispose();
    }
}
