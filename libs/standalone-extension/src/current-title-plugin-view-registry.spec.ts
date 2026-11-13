import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
    Object.defineProperty(globalThis, "DragEvent", {
        configurable: true,
        value: class extends Event {},
    });
});

// Mirrors the parts of Theia's registry the subclass builds on: registration
// stores the title options, prepareViewContainer applies them to the widget,
// and the view widgets and containers it looks up by id.
vi.mock("@theia/plugin-ext/lib/main/browser/view/plugin-view-registry", () => ({
    PLUGIN_VIEW_CONTAINER_FACTORY_ID: "plugin-view-container",
    PLUGIN_VIEW_FACTORY_ID: "plugin-view",
    PluginViewRegistry: class {
        private readonly titleOptionsByContainer = new Map<string, ViewContainerTitleOptions>();
        private nextIconId = 0;
        readonly viewsByContainer = new Map<string, string[]>();
        readonly widgetsByView = new Map<string, object>();
        readonly containersById = new Map<string, object>();
        protected readonly widgetManager = {
            tryGetWidget: (_factoryId: string, identifier: { id: string }) =>
                this.widgetsByView.get(identifier.id),
        };

        getContainerViews(viewContainerId: string): string[] {
            return this.viewsByContainer.get(viewContainerId) ?? [];
        }

        protected toPluginViewWidgetIdentifier(viewId: string) {
            return { id: viewId };
        }

        protected async getPluginViewContainer(viewContainerId: string) {
            return this.containersById.get(viewContainerId);
        }

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

    override getPartFor(widget: object): ViewContainerPart | undefined {
        return this.parts.find((part) => part.wrapped === widget);
    }

    override removeWidget(widget: object): boolean {
        const before = this.parts.length;
        this.parts = this.parts.filter((part) => part.wrapped !== widget);
        return this.parts.length < before;
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

/** The lookups the mocked registry holds, which Theia's real one keeps elsewhere. */
interface FakeLookups {
    readonly viewsByContainer: Map<string, string[]>;
    readonly widgetsByView: Map<string, object>;
    readonly containersById: Map<string, object>;
}

function fakeOf(registry: CurrentTitlePluginViewRegistry): FakeLookups {
    return registry as unknown as FakeLookups;
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

    it("shows the current title on a container left with only a view moved out of a stale container", async () => {
        const { registry } = registryWithDeployContainer();
        registry.registerViewContainer("left", {
            id: "other",
            title: "Other",
            iconUrl: "/hostedPlugin/other/icon.svg",
        });
        const otherContainerWidgetId = "plugin-view-container:workbench.view.extension.other";
        const otherTitle = { label: "Other", iconClass: "other-icon" };
        const other = restoredContainer(otherContainerWidgetId, otherTitle, [
            viewPart("Deploy", DEPLOY_CONTAINER_WIDGET_ID, STALE_TITLE),
        ]);

        await registry["prepareViewContainer"]("workbench.view.extension.other", other);

        expect(other.title.label).toBe(`${CURRENT_TITLE.label}: Deploy`);
        expect(other.title.iconClass).toBe(CURRENT_TITLE.iconClass);
    });

    it("refreshes a view moved out of a stale container into a built-in one", async () => {
        const { registry } = registryWithDeployContainer();
        const explorerTitle = { label: "Explorer", iconClass: "codicon codicon-files" };
        const movedPart = viewPart("Deploy", DEPLOY_CONTAINER_WIDGET_ID, STALE_TITLE);
        const explorer = restoredContainer("explorer-view-container", explorerTitle, [
            viewPart("Files", "explorer-view-container", explorerTitle),
            movedPart,
        ]);

        await registry["prepareViewContainer"]("explorer", explorer);

        expect(movedPart.originalContainerTitle).toEqual(CURRENT_TITLE);
        expect(explorer.title.label).toBe("Explorer");
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

    describe("a view a newer version contributes to another container", () => {
        const ADD_ONS_CONTAINER_ID = "workbench.view.extension.bpmn-modeler-add-ons";
        const ADD_ONS_VIEW = "bpmn-modeler.addOnsView";

        function restoredLayoutWithAddOnsUnderDeploy(addOnsOriginalContainerId: string) {
            const { registry } = registryWithDeployContainer();
            registry.registerViewContainer("left", {
                id: "bpmn-modeler-add-ons",
                title: "Add-ons",
                iconUrl: "/hostedPlugin/miragon/icons/puzzle.svg",
            });
            fakeOf(registry).viewsByContainer.set(DEPLOY_CONTAINER_ID, [
                "bpmn-modeler.deploymentView",
            ]);
            fakeOf(registry).viewsByContainer.set(ADD_ONS_CONTAINER_ID, [ADD_ONS_VIEW]);
            const addOnsPart = viewPart("Add-ons", addOnsOriginalContainerId, STALE_TITLE);
            const deploy = restoredContainer(DEPLOY_CONTAINER_WIDGET_ID, STALE_TITLE, [
                viewPart("Deploy", DEPLOY_CONTAINER_WIDGET_ID, STALE_TITLE),
                addOnsPart,
            ]);
            fakeOf(registry).widgetsByView.set(ADD_ONS_VIEW, {
                ...addOnsPart.wrapped,
                currentViewContainerId: DEPLOY_CONTAINER_ID,
            });
            const widget = fakeOf(registry).widgetsByView.get(ADD_ONS_VIEW)!;
            (addOnsPart as { wrapped: object }).wrapped = widget;
            fakeOf(registry).containersById.set(DEPLOY_CONTAINER_ID, deploy);
            return { registry, deploy };
        }

        it("leaves the container an older version placed it in, so its own container takes it", async () => {
            const { registry, deploy } = restoredLayoutWithAddOnsUnderDeploy(
                DEPLOY_CONTAINER_WIDGET_ID,
            );
            const addOns = restoredContainer(
                `plugin-view-container:${ADD_ONS_CONTAINER_ID}`,
                CURRENT_TITLE,
                [],
            );

            await registry["prepareViewContainer"](ADD_ONS_CONTAINER_ID, addOns);

            expect(deploy.getParts().map((part) => part.wrapped.title.label)).toEqual(["Deploy"]);
        });

        it("stays where the user dragged it", async () => {
            const { registry, deploy } = restoredLayoutWithAddOnsUnderDeploy(
                "plugin-view-container:workbench.view.extension.elsewhere",
            );
            const addOns = restoredContainer(
                `plugin-view-container:${ADD_ONS_CONTAINER_ID}`,
                CURRENT_TITLE,
                [],
            );

            await registry["prepareViewContainer"](ADD_ONS_CONTAINER_ID, addOns);

            expect(deploy.getParts().map((part) => part.wrapped.title.label)).toEqual([
                "Deploy",
                "Add-ons",
            ]);
        });

        it("stays in a container that still lists it", async () => {
            const { registry, deploy } = restoredLayoutWithAddOnsUnderDeploy(
                DEPLOY_CONTAINER_WIDGET_ID,
            );
            fakeOf(registry).viewsByContainer.set(DEPLOY_CONTAINER_ID, [
                "bpmn-modeler.deploymentView",
                ADD_ONS_VIEW,
            ]);

            await registry["prepareViewContainer"](ADD_ONS_CONTAINER_ID, deploy);

            expect(deploy.getParts()).toHaveLength(2);
        });
    });
});
