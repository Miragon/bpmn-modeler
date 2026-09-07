import VendorDmnModeler from "dmn-js/lib/Modeler";
import {
    CamundaPropertiesProviderModule,
    DmnPropertiesPanelModule,
    DmnPropertiesProviderModule,
} from "dmn-js-properties-panel";
import DmnSimulationModule from "@emaarco/dmn-js-simulation";
import camundaModdleDescriptor from "camunda-dmn-moddle/resources/camunda.json";

import { observeCanvasSize, type ResizableCanvas } from "@miragon/bpmn-modeler-types";

import type {
    DmnModelerHandle,
    DmnModelerOptions,
    DmnOperationResult,
    DmnThemeMode,
    DmnView,
    DmnViewChangedEvent,
    DmnWarning,
} from "./publicApi";

const DEFAULT_EXPRESSION_LANGUAGES = {
    options: [
        { value: "feel", label: "FEEL" },
        { value: "juel", label: "JUEL" },
        { value: "javascript", label: "JavaScript" },
        { value: "groovy", label: "Groovy" },
        { value: "python", label: "Python" },
        { value: "jruby", label: "JRuby" },
    ],
    defaults: { editor: "feel" },
};

const DEFAULT_DATA_TYPES = ["string", "boolean", "integer", "long", "double", "date"];

interface EventBus {
    on(event: string, callback: () => void): void;
    off(event: string, callback: () => void): void;
}

interface ActiveViewer {
    get<T = unknown>(name: string, strict?: boolean): T;
}

interface FocusableCanvas extends ResizableCanvas {
    focus(): void;
    isFocused(): boolean;
}

/** @internal Runtime implementation of the public per-instance handle. */
export class DmnModeler implements DmnModelerHandle {
    private readonly modeler: VendorDmnModeler;
    private readonly stopObservingSize: () => void;
    private activeEventBus?: EventBus;
    private destroyed = false;

    constructor(
        container: HTMLElement,
        private readonly options: DmnModelerOptions,
    ) {
        const additionalModules = options.additionalModules ?? {};

        this.modeler = new VendorDmnModeler({
            container,
            drd: {
                propertiesPanel: options.propertiesPanel,
                additionalModules: [
                    DmnPropertiesPanelModule,
                    DmnPropertiesProviderModule,
                    CamundaPropertiesProviderModule,
                    DmnSimulationModule.decisionRequirementsDiagram,
                    ...(additionalModules.drd ?? []),
                ],
            },
            decisionTable: {
                additionalModules: [
                    DmnSimulationModule.decisionTable,
                    ...(additionalModules.decisionTable ?? []),
                ],
            },
            literalExpression: {
                additionalModules: additionalModules.literalExpression ?? [],
            },
            boxedExpression: {
                additionalModules: additionalModules.boxedExpression ?? [],
            },
            common: {
                expressionLanguages: options.expressionLanguages ?? DEFAULT_EXPRESSION_LANGUAGES,
                dataTypes: options.dataTypes ?? DEFAULT_DATA_TYPES,
                keyboard: options.keyboard,
            },
            moddleExtensions: {
                camunda: camundaModdleDescriptor,
                ...options.moddleExtensions,
            },
        });

        this.modeler.on("views.changed", this.handleViewsChanged);
        this.stopObservingSize = observeCanvasSize(
            {
                resized: () => {
                    if (!this.destroyed) {
                        this.getActiveCanvas()?.resized();
                    }
                },
            },
            container,
        );
    }

    async loadDiagram(xml: string): Promise<DmnOperationResult> {
        this.assertLive();
        try {
            const result = await this.modeler.importXML(xml);
            this.bindActiveViewer();
            this.reportWarnings(result.warnings);
            return result;
        } catch (error) {
            throw enhanceOperationError("Unable to import DMN", error);
        }
    }

    async exportDiagram(): Promise<string> {
        this.assertLive();
        const result = await this.modeler.saveXML({ format: true });
        if (result.xml) {
            return result.xml;
        }
        throw new Error("Failed to save changes made to the diagram!");
    }

    getActiveView(): DmnView | undefined {
        this.assertLive();
        return this.modeler.getActiveView();
    }

    getViews(): DmnView[] {
        this.assertLive();
        return this.modeler.getViews();
    }

    async openView(view: DmnView): Promise<DmnOperationResult> {
        this.assertLive();
        try {
            const result = await this.modeler.open(view);
            this.bindActiveViewer();
            this.reportWarnings(result.warnings);
            return result;
        } catch (error) {
            throw enhanceOperationError(`Unable to open DMN view <${view.id}>`, error);
        }
    }

    isDrdViewActive(): boolean {
        this.assertLive();
        return this.modeler.getActiveView()?.type === "drd";
    }

    focusCanvas(): void {
        this.assertLive();
        this.getActiveFocusableCanvas()?.focus();
    }

    isCanvasFocused(): boolean {
        this.assertLive();
        return this.getActiveFocusableCanvas()?.isFocused() ?? false;
    }

    setTheme(_theme: DmnThemeMode): void {
        this.assertLive();
    }

    getService<T = unknown>(name: string): T {
        this.assertLive();
        const viewer = this.getActiveViewer();
        if (!viewer) {
            throw new Error("No active DMN view is available");
        }
        return viewer.get<T>(name);
    }

    destroy(): void {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this.modeler.off("views.changed", this.handleViewsChanged);
        this.unbindCommandStack();
        this.stopObservingSize();
        this.modeler.destroy();
    }

    private readonly handleViewsChanged = (event: DmnViewChangedEvent): void => {
        if (this.destroyed) {
            return;
        }

        this.bindActiveViewer();
        this.options.onViewChanged?.(event);
    };

    private bindActiveViewer(): void {
        if (this.destroyed) {
            return;
        }
        const eventBus = this.getActiveViewer()?.get<EventBus>("eventBus");
        if (eventBus !== this.activeEventBus) {
            this.unbindCommandStack();
            this.activeEventBus = eventBus;
            this.activeEventBus?.on("commandStack.changed", this.handleContentChanged);
        }
    }

    private readonly handleContentChanged = (): void => {
        if (!this.destroyed) {
            this.options.onContentChanged?.();
        }
    };

    private unbindCommandStack(): void {
        this.activeEventBus?.off("commandStack.changed", this.handleContentChanged);
        this.activeEventBus = undefined;
    }

    private reportWarnings(warnings: DmnWarning[]): void {
        if (this.destroyed) {
            return;
        }
        for (const warning of warnings) {
            this.options.onWarning?.(formatWarning(warning));
        }
    }

    private getActiveViewer(): ActiveViewer | undefined {
        return this.modeler.getActiveViewer();
    }

    private getActiveCanvas(): ResizableCanvas | undefined {
        return this.getActiveViewer()?.get<ResizableCanvas>("canvas", false);
    }

    private getActiveFocusableCanvas(): FocusableCanvas | undefined {
        if (this.modeler.getActiveView()?.type !== "drd") {
            return undefined;
        }
        return this.getActiveViewer()?.get<FocusableCanvas>("canvas", false);
    }

    private assertLive(): void {
        if (this.destroyed) {
            throw new Error("DMN modeler has been destroyed");
        }
    }
}

function enhanceOperationError(context: string, error: unknown): Error {
    const originalMessage = error instanceof Error ? error.message : String(error);
    const warnings = getWarnings(error);
    const warningDetails = warnings.map(formatWarning).filter(Boolean);
    const details = warningDetails.length > 0 ? `\n${warningDetails.join("\n")}` : "";
    return new Error(`${context}: ${originalMessage}${details}`, { cause: error });
}

function getWarnings(error: unknown): DmnWarning[] {
    if (typeof error !== "object" || error === null || !("warnings" in error)) {
        return [];
    }
    const warnings = (error as { warnings?: unknown }).warnings;
    return Array.isArray(warnings) ? (warnings as DmnWarning[]) : [];
}

function formatWarning(warning: DmnWarning): string {
    return [warning.message, warning.error?.message, warning.error?.stack]
        .filter((part): part is string => Boolean(part))
        .join("\n");
}
