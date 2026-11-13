/**
 * Shows a plugin view container with the title and icon its plugin contributes
 * now, not the ones Theia stored in the layout of an earlier version.
 *
 * Theia restores the stored title of a plugin view container and of each view
 * part (`originalContainerTitle`). The registry applies the current title in
 * `prepareViewContainer`, which `initWidgets` runs again for every restored
 * container once the layout and the plugin contributions are in, but
 * `ViewContainer.updateTitle` switches back to a part's stored original
 * title whenever it differs. This registry gives every part whose original
 * container is a registered plugin view container that container's current
 * title first, also when the part was moved into another container.
 *
 * A view a newer version contributes to another container would also stay
 * where the stored layout keeps it: Theia leaves an existing view widget in
 * its current container, and closes the new container as it has no part. So
 * a view the old version put into another plugin container (its part's
 * original container is that container) is removed from it first, which
 * disposes the widget, and Theia builds it anew in its own container. A
 * plugin container left without a visible view closes; Theia opens it again
 * once its view shows. A view the user dragged elsewhere keeps their place.
 */
import type {
    ViewContainer,
    ViewContainerTitleOptions,
} from "@theia/core/lib/browser/view-container";
import { Disposable, DisposableCollection } from "@theia/core/lib/common/disposable";
import { injectable } from "@theia/core/shared/inversify";
import {
    PLUGIN_VIEW_CONTAINER_FACTORY_ID,
    PLUGIN_VIEW_FACTORY_ID,
    PluginViewRegistry,
} from "@theia/plugin-ext/lib/main/browser/view/plugin-view-registry";
import type { PluginViewWidget } from "@theia/plugin-ext/lib/main/browser/view/plugin-view-widget";

const PLUGIN_VIEW_CONTAINER_WIDGET_ID_PREFIX = `${PLUGIN_VIEW_CONTAINER_FACTORY_ID}:`;

@injectable()
export class CurrentTitlePluginViewRegistry extends PluginViewRegistry {
    private readonly currentTitleByContainerId = new Map<string, ViewContainerTitleOptions>();

    protected override doRegisterViewContainer(
        id: string,
        location: string,
        options: ViewContainerTitleOptions,
        when?: string,
    ): Disposable {
        this.currentTitleByContainerId.set(id, options);
        return new DisposableCollection(
            super.doRegisterViewContainer(id, location, options, when),
            Disposable.create(() => this.currentTitleByContainerId.delete(id)),
        );
    }

    protected override async prepareViewContainer(
        viewContainerId: string,
        containerWidget: ViewContainer,
    ): Promise<void> {
        for (const part of containerWidget.getParts()) {
            const currentTitle = this.currentTitleOfWidget(part.originalContainerId);
            if (currentTitle) {
                refreshOriginalContainerTitle(part, currentTitle);
            }
        }
        await this.releaseViewsLeftBehind(viewContainerId);
        await super.prepareViewContainer(viewContainerId, containerWidget);
    }

    private async releaseViewsLeftBehind(viewContainerId: string): Promise<void> {
        for (const viewId of this.getContainerViews(viewContainerId)) {
            const leftBehind = await this.placedElsewhereByOldVersion(viewId, viewContainerId);
            if (leftBehind) {
                releaseView(leftBehind.container, leftBehind.widget);
            }
        }
    }

    private async placedElsewhereByOldVersion(
        viewId: string,
        viewContainerId: string,
    ): Promise<{ container: ViewContainer; widget: PluginViewWidget } | undefined> {
        const widget = this.widgetManager.tryGetWidget<PluginViewWidget>(
            PLUGIN_VIEW_FACTORY_ID,
            this.toPluginViewWidgetIdentifier(viewId),
        );
        const currentId = widget?.currentViewContainerId;
        if (widget === undefined || currentId === undefined || currentId === viewContainerId) {
            return undefined;
        }
        const container = await this.getPluginViewContainer(currentId);
        return container && wasPlacedByOldVersion(container, widget)
            ? { container, widget }
            : undefined;
    }

    private currentTitleOfWidget(containerWidgetId: string): ViewContainerTitleOptions | undefined {
        if (!containerWidgetId.startsWith(PLUGIN_VIEW_CONTAINER_WIDGET_ID_PREFIX)) {
            return undefined;
        }
        return this.currentTitleByContainerId.get(
            containerWidgetId.slice(PLUGIN_VIEW_CONTAINER_WIDGET_ID_PREFIX.length),
        );
    }
}

function wasPlacedByOldVersion(container: ViewContainer, widget: PluginViewWidget): boolean {
    return container.getPartFor(widget)?.originalContainerId === container.id;
}

function releaseView(container: ViewContainer, widget: PluginViewWidget): void {
    container.removeWidget(widget);
    const isPluginContainer = container.id.startsWith(PLUGIN_VIEW_CONTAINER_WIDGET_ID_PREFIX);
    if (isPluginContainer && container.getParts().every(({ isHidden }) => isHidden)) {
        container.dispose();
    }
}

// Theia types the field readonly but only ever sets it from the stored layout.
function refreshOriginalContainerTitle(
    part: { originalContainerTitle?: ViewContainerTitleOptions },
    currentTitle: ViewContainerTitleOptions,
): void {
    part.originalContainerTitle = currentTitle;
}
