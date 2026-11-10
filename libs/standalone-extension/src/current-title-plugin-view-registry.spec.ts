import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
    Object.defineProperty(globalThis, "DragEvent", {
        configurable: true,
        value: class extends Event {},
    });
});

// Mirrors the parts of Theia's registry the subclass builds on: registration
// stores the title options, prepareViewContainer applies them to the widget.
vi.mock("@theia/plugin-ext/lib/main/browser/view/plugin-view-registry", () => ({
    PluginViewRegistry: class {
        private readonly titleOptionsByContainer = new Map<string, ViewContainerTitleOptions>();
        private nextIconId = 0;

        registerViewContainer(location: string, viewContainer: { id: string; title: string }) {
            return this.doRegisterViewContainer(
                `workbench.view.extension.${viewContainer.id}`,
                location,
                {
                    label: viewContainer.title,
                    iconClass: `theia-plugin-view-container plugin-view-container-icon-${this.nextIconId++}`,
                    closeable: true,
                },
            );
        }

        protected doRegisterViewContainer(
            id: string,
            _location: string,
            options: ViewContainerTitleOptions,
        ) {
            this.titleOptionsByContainer.set(id, options);
            return { dispose: () => this.titleOptionsByContainer.delete(id) };
        }

        protected async prepareViewContainer(
            viewContainerId: string,
            containerWidget: { setTitleOptions(options: ViewContainerTitleOptions): void },
        ) {
            const options = this.titleOptionsByContainer.get(viewContainerId);
            if (options) {
                containerWidget.setTitleOptions(options);
            }
        }
    },
}));

import { Disposable } from "@theia/core/lib/common/disposable";
import {
    ViewContainer,
    type ViewContainerPart,
    type ViewContainerTitleOptions,
} from "@theia/core/lib/browser/view-container";

import { CurrentTitlePluginViewRegistry } from "./current-title-plugin-view-registry";

const DEPLOY_CONTAINER_ID = "workbench.view.extension.bpmn-modeler-deploy";
const DEPLOY_CONTAINER_WIDGET_ID = `plugin-view-container:${DEPLOY_CONTAINER_ID}`;

const STALE_TITLE: ViewContainerTitleOptions = {
    label: "Deploy Diagram",
    iconClass: "codicon codicon-rocket plugin-view-container-icon-0",
    closeable: true,
};
const CURRENT_TITLE: ViewContainerTitleOptions = {
    label: "BPMN Modeler",
    iconClass: "theia-plugin-view-container plugin-view-container-icon-0",
    closeable: true,
};

class RestoredViewContainer extends ViewContainer {
    parts: ViewContainerPart[] = [];

    override getParts(): ViewContainerPart[] {
        return this.parts;
    }

    protected override updateToolbarItems(): void {
        // The parts menu needs Theia's menu services; the title rule does not.
    }

    refreshTitle(): void {
        this.updateTitle();
    }
}

function viewPart(
    label: string,
    originalContainerId: string,
    originalContainerTitle: ViewContainerTitleOptions,
): ViewContainerPart {
    return {
        originalContainerId,
        originalContainerTitle,
        isHidden: false,
        collapsed: false,
        wrapped: { title: { label } },
        onTitleChanged: () => Disposable.NULL,
        showTitle: () => undefined,
        hideTitle: () => undefined,
    } as unknown as ViewContainerPart;
}

function restoredContainer(
    widgetId: string,
    storedTitle: ViewContainerTitleOptions,
    parts: ViewContainerPart[],
): RestoredViewContainer {
    const container = new RestoredViewContainer();
    container.id = widgetId;
    container.parts = parts;
    container.setTitleOptions(storedTitle);
    return container;
}

function restoredDeployContainer(): RestoredViewContainer {
    return restoredContainer(DEPLOY_CONTAINER_WIDGET_ID, STALE_TITLE, [
        viewPart("Deploy", DEPLOY_CONTAINER_WIDGET_ID, STALE_TITLE),
        viewPart("Add-ons", DEPLOY_CONTAINER_WIDGET_ID, STALE_TITLE),
    ]);
}

function registryWithDeployContainer() {
    const registry = new CurrentTitlePluginViewRegistry();
    const registration = registry.registerViewContainer("left", {
        id: "bpmn-modeler-deploy",
        title: "BPMN Modeler",
        iconUrl: "/hostedPlugin/miragon/icons/komet.svg",
    });
    return { registry, registration };
}

describe("CurrentTitlePluginViewRegistry", () => {
    it("shows the current label and icon of a restored container whose stored title is stale", async () => {
        const { registry } = registryWithDeployContainer();
        const container = restoredDeployContainer();

        await registry["prepareViewContainer"](DEPLOY_CONTAINER_ID, container);

        expect(container.title.label).toBe(CURRENT_TITLE.label);
        expect(container.title.iconClass).toBe(CURRENT_TITLE.iconClass);
    });

    it("keeps the current title when the container updates its title again", async () => {
        const { registry } = registryWithDeployContainer();
        const container = restoredDeployContainer();

        await registry["prepareViewContainer"](DEPLOY_CONTAINER_ID, container);
        container.refreshTitle();

        expect(container.title.label).toBe(CURRENT_TITLE.label);
        expect(container.title.iconClass).toBe(CURRENT_TITLE.iconClass);
        expect(container.getParts().map((part) => part.originalContainerTitle)).toEqual([
            CURRENT_TITLE,
            CURRENT_TITLE,
        ]);
    });

    it("leaves a view that came from another container with that container's title", async () => {
        const { registry } = registryWithDeployContainer();
        const otherTitle = { label: "Other", iconClass: "other-icon" };
        const movedPart = viewPart("Moved", "plugin-view-container:other", otherTitle);
        const container = restoredContainer(DEPLOY_CONTAINER_WIDGET_ID, STALE_TITLE, [
            viewPart("Deploy", DEPLOY_CONTAINER_WIDGET_ID, STALE_TITLE),
            movedPart,
        ]);

        await registry["prepareViewContainer"](DEPLOY_CONTAINER_ID, container);

        expect(movedPart.originalContainerTitle).toBe(otherTitle);
    });

    it("leaves built-in view containers alone", async () => {
        const { registry } = registryWithDeployContainer();
        const explorerTitle = { label: "Explorer", iconClass: "codicon codicon-files" };
        const explorer = restoredContainer("explorer-view-container", explorerTitle, [
            viewPart("Files", "explorer-view-container", explorerTitle),
            viewPart("Open Editors", "explorer-view-container", explorerTitle),
        ]);

        await registry["prepareViewContainer"]("explorer", explorer);

        expect(explorer.title.label).toBe("Explorer");
        expect(explorer.getParts().map((part) => part.originalContainerTitle)).toEqual([
            explorerTitle,
            explorerTitle,
        ]);
    });

    it("keeps the stored title of a container its plugin no longer registers", async () => {
        const { registry, registration } = registryWithDeployContainer();
        registration.dispose();
        const container = restoredDeployContainer();

        await registry["prepareViewContainer"](DEPLOY_CONTAINER_ID, container);

        expect(container.title.label).toBe(STALE_TITLE.label);
        expect(container.getParts().map((part) => part.originalContainerTitle)).toEqual([
            STALE_TITLE,
            STALE_TITLE,
        ]);
    });
});
