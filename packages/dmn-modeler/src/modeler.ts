import VendorDmnModeler from "dmn-js/lib/Modeler";
import {
    CamundaPropertiesProviderModule,
    DmnPropertiesPanelModule,
    DmnPropertiesProviderModule,
} from "dmn-js-properties-panel";
import DmnSimulationModule from "@emaarco/dmn-js-simulation";
import camundaModdleDescriptor from "camunda-dmn-moddle/resources/camunda.json";

import {
    installCanvasFocusIndicator,
    observeCanvasSize,
    type ResizableCanvas,
} from "@miragon/bpmn-modeler-types";
import { i18n, TranslateModule, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";

import { ThemeController } from "./theme";
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

interface FocusIndicatorCanvas {
    getContainer(): HTMLElement;
    isFocused(): boolean;
}

interface DrdSelection {
    get(): unknown[];
}

interface FocusEventBus {
    on(event: "canvas.focus.changed", callback: (event: { focused: boolean }) => void): void;
    on(event: "selection.changed", callback: (event: { newSelection: unknown[] }) => void): void;
}

interface Viewbox {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ViewboxCanvas extends ResizableCanvas {
    viewbox(): Viewbox;
    viewbox(box: Viewbox): void;
}

/** @internal */
export class DmnModeler implements DmnModelerHandle {
    private readonly modeler: VendorDmnModeler;
    private readonly stopObservingSize: () => void;
    private activeEventBus?: EventBus;
    private disposeFocusIndicator?: () => void;
    private destroyed = false;

    private themeController?: ThemeController;

    constructor(
        private readonly container: HTMLElement,
        private readonly options: DmnModelerOptions,
    ) {
        const additionalModules = options.additionalModules ?? {};

        this.modeler = new VendorDmnModeler({
            container,
            // dmn-js drops common.additionalModules, so each view needs TranslateModule.
            drd: {
                propertiesPanel: {
                    ...options.propertiesPanel,
                    // The default document.body mount lies outside this instance’s theme scope.
                    feelPopupContainer: container,
                },
                additionalModules: [
                    TranslateModule,
                    DmnPropertiesPanelModule,
                    DmnPropertiesProviderModule,
                    CamundaPropertiesProviderModule,
                    DmnSimulationModule.decisionRequirementsDiagram,
                    ...(additionalModules.drd ?? []),
                ],
            },
            decisionTable: {
                additionalModules: [
                    TranslateModule,
                    DmnSimulationModule.decisionTable,
                    ...(additionalModules.decisionTable ?? []),
                ],
            },
            literalExpression: {
                additionalModules: [
                    TranslateModule,
                    ...(additionalModules.literalExpression ?? []),
                ],
            },
            boxedExpression: {
                additionalModules: [TranslateModule, ...(additionalModules.boxedExpression ?? [])],
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

    async setLocale(locale: string): Promise<void> {
        this.assertLive();
        const localeBefore = i18n.getLocale();
        i18n.setLanguage(locale as SupportedLocale);
        // Compare resolved locales: unknown codes fall back to "en".
        if (i18n.getLocale() === localeBefore) {
            return;
        }
        const activeView = this.modeler.getActiveView();
        if (!activeView) {
            return;
        }
        // Reopening resets the DRD viewbox; preserve it to avoid moving the diagram.
        const viewbox = this.isDrdViewActive()
            ? this.getActiveViewboxCanvas()?.viewbox()
            : undefined;
        await this.openView(activeView);
        if (viewbox) {
            this.getActiveViewboxCanvas()?.viewbox(viewbox);
        }
    }

    setTheme(theme: DmnThemeMode): void {
        this.assertLive();
        if (!this.themeController) {
            this.themeController = new ThemeController([
                this.container,
                this.options.propertiesPanel.parent,
            ]);
        }
        this.themeController.setMode(theme);
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
        this.disposeFocusIndicator?.();
        this.themeController?.dispose();
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
            this.syncCanvasFocusIndicator();
        }
    }

    // Only the DRD view has diagram-js canvas focus.
    private syncCanvasFocusIndicator(): void {
        this.disposeFocusIndicator?.();
        this.disposeFocusIndicator = undefined;

        if (this.modeler.getActiveView()?.type !== "drd") {
            return;
        }
        const viewer = this.getActiveViewer();
        const canvas = viewer?.get<FocusIndicatorCanvas>("canvas", false);
        const selection = viewer?.get<DrdSelection>("selection", false);
        const eventBus = viewer?.get<FocusEventBus>("eventBus", false);
        if (!canvas || !selection || !eventBus) {
            return;
        }
        this.disposeFocusIndicator = installCanvasFocusIndicator({
            parent: canvas.getContainer(),
            isFocused: () => canvas.isFocused(),
            onFocusChanged: (listener) =>
                eventBus.on("canvas.focus.changed", (event) => listener(event.focused)),
            hasSelection: () => selection.get().length > 0,
            onSelectionChanged: (listener) =>
                eventBus.on("selection.changed", (event) =>
                    listener(event.newSelection.length > 0),
                ),
        });
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

    private getActiveViewboxCanvas(): ViewboxCanvas | undefined {
        return this.getActiveViewer()?.get<ViewboxCanvas>("canvas", false);
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
