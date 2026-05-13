/**
 * Removes Theia's built-in IDE views that have no purpose in a BPMN
 * modeler — Extensions Marketplace, Debug, Test Explorer, Outline.
 * Without this, users see a sidebar full of empty/inapplicable panels and
 * the app feels like a half-finished IDE rather than a focused modeling tool.
 *
 * Implementation note:
 *   We dispose the widgets after Theia restored layout, rather than blocking
 *   them at registration time. That way Theia still wires up its commands
 *   and contribution points (avoiding internal warnings) but the user-facing
 *   panels never appear in the activity bar.
 *
 *   The widget IDs below are Theia internals — re-check them when bumping
 *   the Theia version (currently pinned to 1.70.x).
 */
import { inject, injectable } from "@theia/core/shared/inversify";
import { FrontendApplication, FrontendApplicationContribution } from "@theia/core/lib/browser";
import { WidgetManager } from "@theia/core/lib/browser/widget-manager";

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
        await Promise.all(HIDDEN_VIEW_CONTAINER_IDS.map((id) => this.hideWidget(app, id)));
    }

    private async hideWidget(app: FrontendApplication, id: string): Promise<void> {
        const widget = app.shell.getWidgetById(id) ?? (await this.widgetManager.tryGetWidget(id));
        widget?.dispose();
    }
}
