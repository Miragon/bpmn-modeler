/**
 * Shows a plugin view container with the title and icon its plugin contributes
 * now, not the ones Theia stored in the layout of an earlier version.
 *
 * Theia restores the stored title of a plugin view container and of each view
 * part (`originalContainerTitle`). The registry applies the current title in
 * `prepareViewContainer`, which `initWidgets` runs again for every restored
 * container once the layout and the plugin contributions are in, but
 * `ViewContainer.updateTitle` switches back to an original part's stored
 * title whenever it differs. This registry gives those parts the current
 * title first.
 */
import type {
    ViewContainer,
    ViewContainerTitleOptions,
} from "@theia/core/lib/browser/view-container";
import { Disposable, DisposableCollection } from "@theia/core/lib/common/disposable";
import { injectable } from "@theia/core/shared/inversify";
import { PluginViewRegistry } from "@theia/plugin-ext/lib/main/browser/view/plugin-view-registry";

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
        const currentTitle = this.currentTitleByContainerId.get(viewContainerId);
        if (currentTitle) {
            containerWidget
                .getParts()
                .filter((part) => part.originalContainerId === containerWidget.id)
                .forEach((part) => refreshOriginalContainerTitle(part, currentTitle));
        }
        await super.prepareViewContainer(viewContainerId, containerWidget);
    }
}

// Theia types the field readonly but only ever sets it from the stored layout.
function refreshOriginalContainerTitle(
    part: { originalContainerTitle?: ViewContainerTitleOptions },
    currentTitle: ViewContainerTitleOptions,
): void {
    part.originalContainerTitle = currentTitle;
}
