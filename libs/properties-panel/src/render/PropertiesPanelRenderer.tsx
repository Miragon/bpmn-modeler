/** @jsxImportSource @bpmn-io/properties-panel/preact */
/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 *
 * Deltas:
 * - `readonly = !injector.get('modeling', false)` is derived once and passed to
 *   the panel component. On a `NavigatedViewer` (no `modeling` service) the
 *   panel renders every entry disabled; on a `Modeler` it stays editable.
 * - the DI config key stays `'config.propertiesPanel'` and every public method
 *   (`registerProvider` / `getEntryId` / `providersChanged` / `attachTo`) keeps
 *   its upstream contract, so existing `propertiesPanel: { parent,
 *   feelPopupContainer }` options and provider registrations work unchanged.
 */
import BpmnPropertiesPanel from "./PropertiesPanel";

import { isUndo, isRedo } from "diagram-js/lib/features/keyboard/KeyboardUtil";

import { render } from "@bpmn-io/properties-panel/preact";

import { domify, query as domQuery, event as domEvent } from "min-dom";

const DEFAULT_PRIORITY = 1000;

export default class PropertiesPanelRenderer {
    static $inject = ["config.propertiesPanel", "injector", "eventBus"];

    private _eventBus: any;
    private _injector: any;
    private _layoutConfig: any;
    private _descriptionConfig: any;
    private _tooltipConfig: any;
    private _feelPopupContainer: any;
    private _getFeelPopupLinks: any;
    private _feelLanguageContext: any;
    private _container: any;
    private _headerContainer: any;
    private _separateHeader: boolean;
    private _readonly: boolean;

    constructor(config: any, injector: any, eventBus: any) {
        const {
            parent,
            layout: layoutConfig,
            description: descriptionConfig,
            tooltip: tooltipConfig,
            feelPopupContainer,
            getFeelPopupLinks,
            feelLanguageContext,
        } = config || {};

        this._eventBus = eventBus;
        this._injector = injector;
        this._layoutConfig = layoutConfig;
        this._descriptionConfig = descriptionConfig;
        this._tooltipConfig = tooltipConfig;
        this._feelPopupContainer = feelPopupContainer;
        this._getFeelPopupLinks = getFeelPopupLinks;
        this._feelLanguageContext = feelLanguageContext;

        this._container = domify(
            '<div style="height: 100%" tabindex="-1" class="bio-properties-panel-container"></div>',
        );

        this._headerContainer = domify(
            '<div style="flex: none; height: auto" class="bio-properties-panel bio-properties-panel-header-container"></div>',
        );

        this._separateHeader = false;

        const commandStack = injector.get("commandStack", false);

        // Readonly whenever the modeler registers no `modeling` service — the
        // exact marker that distinguishes a NavigatedViewer from a Modeler.
        this._readonly = !injector.get("modeling", false);

        if (commandStack) {
            setupKeyboard(this._container, eventBus, commandStack);
        }

        eventBus.on("diagram.init", () => {
            if (parent) {
                this.attachTo(parent);
            }
        });

        eventBus.on("diagram.destroy", () => {
            this.detach();
        });

        eventBus.on("root.added", (event: any) => {
            const { element } = event;

            this._render(element);
        });
    }

    attachTo(container: any, headerContainer?: any): void {
        if (!container) {
            throw new Error("container required");
        }

        container = resolveContainer(container);

        if (headerContainer) {
            headerContainer = resolveContainer(headerContainer);

            if (!headerContainer) {
                throw new Error("header container not found");
            }
        }

        const separateHeader = !!headerContainer;

        const headerPlacementChanged = separateHeader !== this._separateHeader;

        // (1) detach from old parent
        this.detach();

        // (2) append body to its container
        container.appendChild(this._container);

        // (3) append header to its container or render it inline
        this._separateHeader = separateHeader;

        if (headerContainer) {
            headerContainer.appendChild(this._headerContainer);
        }

        // (4) re-render if the header placement changed
        if (headerPlacementChanged) {
            this._rerender();
        }

        // (5) notify interested parties
        this._eventBus.fire("propertiesPanel.attach");
    }

    detach(): void {
        const parentNode = this._container.parentNode;

        if (parentNode) {
            parentNode.removeChild(this._container);

            this._eventBus.fire("propertiesPanel.detach");
        }

        const headerParentNode = this._headerContainer.parentNode;

        if (headerParentNode) {
            headerParentNode.removeChild(this._headerContainer);
        }
    }

    registerProvider(priority: any, provider?: any): void {
        if (!provider) {
            provider = priority;
            priority = DEFAULT_PRIORITY;
        }

        if (typeof provider.getGroups !== "function") {
            console.error("Properties provider does not implement #getGroups(element) API");

            return;
        }

        this._eventBus.on("propertiesPanel.getProviders", priority, function (event: any) {
            event.providers.push(provider);
        });

        this._eventBus.fire("propertiesPanel.providersChanged");
    }

    setLayout(layout: any): void {
        this._eventBus.fire("propertiesPanel.setLayout", { layout });
    }

    setFeelLanguageContext(feelLanguageContext: any): void {
        this._feelLanguageContext = feelLanguageContext;

        this._rerender();
    }

    getEntryId(element: any, path: any): string | null {
        const providers = this._getProviders().slice().reverse();

        for (const provider of providers) {
            if (typeof provider.getEntryId !== "function") {
                continue;
            }

            const entryId = provider.getEntryId(element, path);

            if (entryId) {
                return entryId;
            }
        }

        return null;
    }

    _getProviders(): any[] {
        const event = this._eventBus.createEvent({
            type: "propertiesPanel.getProviders",
            providers: [],
        });

        this._eventBus.fire(event);

        return event.providers;
    }

    _render(element?: any): void {
        const canvas = this._injector.get("canvas");

        if (!element) {
            element = canvas.getRootElement();
        }

        if (isImplicitRoot(element)) {
            return;
        }

        render(
            <BpmnPropertiesPanel
                element={element}
                injector={this._injector}
                getProviders={this._getProviders.bind(this)}
                layoutConfig={this._layoutConfig}
                descriptionConfig={this._descriptionConfig}
                tooltipConfig={this._tooltipConfig}
                feelPopupContainer={this._feelPopupContainer}
                getFeelPopupLinks={this._getFeelPopupLinks}
                feelLanguageContext={this._feelLanguageContext}
                headerParent={this._separateHeader ? this._headerContainer : null}
                readonly={this._readonly}
            />,
            this._container,
        );

        this._eventBus.fire("propertiesPanel.rendered");
    }

    _rerender(): void {
        const canvas = this._injector.get("canvas");

        const rootElement = canvas.getRootElement();

        if (rootElement && !isImplicitRoot(rootElement)) {
            this._render(rootElement);
        }
    }

    _destroy(): void {
        if (this._container) {
            render(null, this._container);

            this._eventBus.fire("propertiesPanel.destroyed");
        }
    }
}

// helpers ///////////////////////

function isImplicitRoot(element: any): boolean {
    return element && element.isImplicit;
}

function resolveContainer(container: any): any {
    // unwrap jQuery if provided
    if (container.get && container.constructor.prototype.jquery) {
        return container.get(0);
    }

    if (typeof container === "string") {
        return domQuery(container);
    }

    return container;
}

function setupKeyboard(container: any, eventBus: any, commandStack: any): void {
    function cancel(event: any) {
        event.preventDefault();
        event.stopPropagation();
    }

    function handleKeys(event: any) {
        if (isUndo(event)) {
            commandStack.undo();

            return cancel(event);
        }

        if (isRedo(event)) {
            commandStack.redo();

            return cancel(event);
        }
    }

    eventBus.on("keyboard.bind", function () {
        domEvent.bind(container, "keydown", handleKeys);
    });

    eventBus.on("keyboard.unbind", function () {
        domEvent.unbind(container, "keydown", handleKeys);
    });
}
