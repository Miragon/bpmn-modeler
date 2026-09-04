/** @jsxImportSource @bpmn-io/properties-panel/preact */
/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 *
 * Delta: accepts a `readonly` prop (derived by the renderer from a missing
 * `modeling` service). When set, {@link applyReadonly} runs on the reduced
 * groups as the deterministic last transform — disabling every entry and
 * stripping ListGroup add/remove affordances — so a `NavigatedViewer` shows the
 * full neutral panel without any write path.
 */
import { useState, useMemo, useEffect, useCallback } from "@bpmn-io/properties-panel/preact/hooks";

import { find, isArray, reduce } from "min-dash";

import { createPortal } from "@bpmn-io/properties-panel/preact/compat";

import { FeelLanguageContext, Header, PropertiesPanel } from "@bpmn-io/properties-panel";

import { PropertiesPanelContext } from "../context/PropertiesPanelContext";

import { PanelHeaderProvider } from "./PanelHeaderProvider";
import { PanelPlaceholderProvider } from "./PanelPlaceholderProvider";
import { applyReadonly } from "./applyReadonly";

const DEFAULT_FEEL_LANGUAGE_CONTEXT = {
    parserDialect: "camunda",
};

export default function BpmnPropertiesPanel(props: any) {
    const {
        element,
        injector,
        getProviders,
        layoutConfig: initialLayoutConfig,
        descriptionConfig,
        tooltipConfig,
        feelPopupContainer,
        getFeelPopupLinks,
        feelLanguageContext,
        headerParent,
        readonly,
    } = props;

    const canvas = injector.get("canvas");
    const elementRegistry = injector.get("elementRegistry");
    const eventBus = injector.get("eventBus");
    const translate = injector.get("translate");

    const [state, setState] = useState({
        selectedElement: element,
    });

    const selectedElement = state.selectedElement;

    const _update = (element: any) => {
        if (!element) {
            return;
        }

        let newSelectedElement = element;

        // handle labels
        if (newSelectedElement && newSelectedElement.type === "label") {
            newSelectedElement = newSelectedElement.labelTarget;
        }

        setState({
            ...state,
            selectedElement: newSelectedElement,
        });

        // notify interested parties on property panel updates
        eventBus.fire("propertiesPanel.updated", {
            element: newSelectedElement,
        });
    };

    // (2) react on element changes

    // (2a) selection changed
    useEffect(() => {
        const onSelectionChanged = (e: any) => {
            const { newSelection = [] } = e;

            if (newSelection.length > 1) {
                return _update(newSelection);
            }

            const newElement = newSelection[0];

            const rootElement = canvas.getRootElement();

            if (isImplicitRoot(rootElement)) {
                return;
            }

            _update(newElement || rootElement);
        };

        eventBus.on("selection.changed", onSelectionChanged);

        return () => {
            eventBus.off("selection.changed", onSelectionChanged);
        };
    }, []);

    // (2b) selected element changed
    useEffect(() => {
        const onElementsChanged = (e: any) => {
            const elements = e.elements;

            const updatedElement = findElement(elements, selectedElement);

            if (updatedElement && elementExists(updatedElement, elementRegistry)) {
                _update(updatedElement);
            }
        };

        eventBus.on("elements.changed", onElementsChanged);

        return () => {
            eventBus.off("elements.changed", onElementsChanged);
        };
    }, [selectedElement]);

    // (2c) import done
    useEffect(() => {
        const onImportDone = () => {
            const rootElement = canvas.getRootElement();

            _update(rootElement);
        };

        eventBus.on("import.done", onImportDone);

        return () => {
            eventBus.off("import.done", onImportDone);
        };
    }, []);

    // (2d) provided entries changed
    useEffect(() => {
        const onProvidersChanged = () => {
            _update(selectedElement);
        };

        eventBus.on("propertiesPanel.providersChanged", onProvidersChanged);

        return () => {
            eventBus.off("propertiesPanel.providersChanged", onProvidersChanged);
        };
    }, [selectedElement]);

    // (2e) element templates changed
    useEffect(() => {
        const onTemplatesChanged = () => {
            _update(selectedElement);
        };

        eventBus.on("elementTemplates.changed", onTemplatesChanged);

        return () => {
            eventBus.off("elementTemplates.changed", onTemplatesChanged);
        };
    }, [selectedElement]);

    // (3) create properties panel context
    const bpmnPropertiesPanelContext = {
        selectedElement,
        injector,
        getService(type: string, strict?: boolean) {
            return injector.get(type, strict);
        },
    };

    // (4) retrieve groups for selected element
    const providers = getProviders(selectedElement);

    const groups = useMemo(() => {
        const built = reduce(
            providers,
            function (groups: any[], provider: any) {
                // do not collect groups for multi element state
                if (isArray(selectedElement)) {
                    return [];
                }

                const updater = provider.getGroups(selectedElement);

                return updater(groups);
            },
            [],
        );

        // Deterministic last transform: on a readonly (viewer) modeler, disable
        // every entry and strip add/remove affordances — covers custom and
        // third-party groups too, since it runs after all providers.
        return readonly ? applyReadonly(built) : built;
    }, [providers, selectedElement, readonly]);

    // (5) notify layout changes
    const [layoutConfig, setLayoutConfig] = useState(initialLayoutConfig || {});

    const onLayoutChanged = useCallback(
        (newLayout: any) => {
            eventBus.fire("propertiesPanel.layoutChanged", {
                layout: newLayout,
            });
        },
        [eventBus],
    );

    // React to external layout changes
    useEffect(() => {
        const cb = (e: any) => {
            const { layout } = e;
            setLayoutConfig(layout);
        };

        eventBus.on("propertiesPanel.setLayout", cb);
        return () => eventBus.off("propertiesPanel.setLayout", cb);
    }, [eventBus, setLayoutConfig]);

    // (6) notify description changes
    const onDescriptionLoaded = (description: any) => {
        eventBus.fire("propertiesPanel.descriptionLoaded", {
            description,
        });
    };

    // (7) notify tooltip changes
    const onTooltipLoaded = (tooltip: any) => {
        eventBus.fire("propertiesPanel.tooltipLoaded", {
            tooltip,
        });
    };

    // (8) render header separately if a header container is provided
    const separateHeader = !!headerParent;
    const renderSeparateHeader = separateHeader && selectedElement && !isArray(selectedElement);

    const headerProvider = PanelHeaderProvider(translate);
    const mergedFeelLanguageContext = useMemo(
        () => ({
            ...DEFAULT_FEEL_LANGUAGE_CONTEXT,
            ...feelLanguageContext,
        }),
        [feelLanguageContext],
    );

    return (
        <PropertiesPanelContext.Provider value={bpmnPropertiesPanelContext}>
            <FeelLanguageContext.Provider value={mergedFeelLanguageContext}>
                <PropertiesPanel
                    element={selectedElement}
                    headerProvider={separateHeader ? null : headerProvider}
                    placeholderProvider={PanelPlaceholderProvider(translate)}
                    groups={groups}
                    layoutConfig={layoutConfig}
                    layoutChanged={onLayoutChanged}
                    descriptionConfig={descriptionConfig}
                    descriptionLoaded={onDescriptionLoaded}
                    tooltipConfig={tooltipConfig}
                    tooltipLoaded={onTooltipLoaded}
                    feelPopupContainer={feelPopupContainer}
                    getFeelPopupLinks={getFeelPopupLinks}
                    eventBus={eventBus}
                />
                {renderSeparateHeader
                    ? createPortal(
                          <Header element={selectedElement} headerProvider={headerProvider} />,
                          headerParent,
                      )
                    : null}
            </FeelLanguageContext.Provider>
        </PropertiesPanelContext.Provider>
    );
}

// helpers //////////////////////////

function isImplicitRoot(element: any): boolean {
    return element && element.isImplicit;
}

function findElement(elements: any, element: any): any {
    return find(elements, (e: any) => e === element);
}

function elementExists(element: any, elementRegistry: any): any {
    return element && elementRegistry.get(element.id);
}
