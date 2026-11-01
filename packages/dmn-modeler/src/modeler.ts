import VendorDmnModeler from "dmn-js/lib/Modeler";
import {
    CamundaPropertiesProviderModule,
    DmnPropertiesPanelModule,
    DmnPropertiesProviderModule,
} from "dmn-js-properties-panel";
import DmnSimulationModule from "@emaarco/dmn-js-simulation";
import camundaModdleDescriptor from "camunda-dmn-moddle/resources/camunda.json";

import {
    createFlushableDebounceInput,
    DisposableStore,
    type FlushableDebounceInput,
    installCanvasFocusIndicator,
    MutableDisposable,
    NoModelerError,
    observeCanvasSize,
    type ResizableCanvas,
    ThemeController,
} from "@miragon/bpmn-modeler-types";
import { i18n, TranslateModule, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";

import type {
    DmnModelerHandle,
    DmnModelerOptions,
    DmnOperationResult,
    DmnPendingInputHandle,
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

const THEME_ATTRIBUTE = "data-dmn-theme";

const DEFAULT_DATA_TYPES = ["string", "boolean", "integer", "long", "double", "date"];

/** The delay of the `@bpmn-io/properties-panel` default the DRD panel's service replaces. */
const PROPERTIES_PANEL_INPUT_DEBOUNCE_MS = 600;

/** The delay of the `dmn-js-shared` default the other views' service replaces. */
const VIEW_EDITOR_INPUT_DEBOUNCE_MS = 300;

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
export class DmnModeler implements DmnModelerHandle, DmnPendingInputHandle {
    private readonly modeler: VendorDmnModeler;
    private readonly store = new DisposableStore();
    private readonly focusIndicator = new MutableDisposable();
    private readonly commandStackBinding = new MutableDisposable();
    // Held here rather than read from the active viewer, so the handle sees the
    // input of every view, not only the open one.
    private readonly propertiesPanelInput = createFlushableDebounceInput(
        PROPERTIES_PANEL_INPUT_DEBOUNCE_MS,
    );
    private readonly viewEditorInput = createFlushableDebounceInput(VIEW_EDITOR_INPUT_DEBOUNCE_MS);
    private activeEventBus?: EventBus;
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
                    // After the panel, so its `debounceInput` is the flushable one.
                    debounceInputModule(this.propertiesPanelInput),
                    ...(additionalModules.drd ?? []),
                ],
            },
            // dmn-js adds a view's own modules first, so these replace its `debounceInput`.
            decisionTable: {
                additionalModules: [
                    TranslateModule,
                    DmnSimulationModule.decisionTable,
                    debounceInputModule(this.viewEditorInput),
                    ...(additionalModules.decisionTable ?? []),
                ],
            },
            literalExpression: {
                additionalModules: [
                    TranslateModule,
                    debounceInputModule(this.viewEditorInput),
                    ...(additionalModules.literalExpression ?? []),
                ],
            },
            boxedExpression: {
                additionalModules: [
                    TranslateModule,
                    debounceInputModule(this.viewEditorInput),
                    ...(additionalModules.boxedExpression ?? []),
                ],
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

        this.store.add(() => this.modeler.destroy());
        this.modeler.on("views.changed", this.handleViewsChanged);
        this.store.add(() => this.modeler.off("views.changed", this.handleViewsChanged));
        this.store.add(
            observeCanvasSize(
                {
                    resized: () => {
                        if (!this.store.isDisposed) {
                            this.getActiveCanvas()?.resized();
                        }
                    },
                },
                container,
            ),
        );
        this.store.add(
            () => {
                this.commandStackBinding.dispose();
                this.activeEventBus = undefined;
            },
            () => this.focusIndicator.dispose(),
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
        if (this.store.isDisposed) {
            return;
        }
        if (!this.themeController) {
            const controller = new ThemeController(
                [this.container, this.options.propertiesPanel.parent],
                THEME_ATTRIBUTE,
            );
            this.themeController = controller;
            this.store.add(() => controller.dispose());
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

    /** @internal See {@link DmnPendingInputHandle.hasPendingInput}. */
    hasPendingInput(): boolean {
        return (
            !this.store.isDisposed &&
            (this.propertiesPanelInput.hasPending() || this.viewEditorInput.hasPending())
        );
    }

    /** @internal See {@link DmnPendingInputHandle.flushPendingInput}. */
    flushPendingInput(): void {
        if (!this.store.isDisposed) {
            this.propertiesPanelInput.flush();
            this.viewEditorInput.flush();
        }
    }

    destroy(): void {
        this.store.dispose();
    }

    private readonly handleViewsChanged = (event: DmnViewChangedEvent): void => {
        if (this.store.isDisposed) {
            return;
        }

        this.bindActiveViewer();
        this.options.onViewChanged?.(event);
    };

    private bindActiveViewer(): void {
        if (this.store.isDisposed) {
            return;
        }
        const eventBus = this.getActiveViewer()?.get<EventBus>("eventBus");
        if (eventBus !== this.activeEventBus) {
            this.activeEventBus = eventBus;
            eventBus?.on("commandStack.changed", this.handleContentChanged);
            this.commandStackBinding.set(
                eventBus && (() => eventBus.off("commandStack.changed", this.handleContentChanged)),
            );
            this.syncCanvasFocusIndicator();
        }
    }

    // Only the DRD view has diagram-js canvas focus.
    private syncCanvasFocusIndicator(): void {
        this.focusIndicator.set(undefined);

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
        this.focusIndicator.set(
            installCanvasFocusIndicator({
                parent: canvas.getContainer(),
                isFocused: () => canvas.isFocused(),
                onFocusChanged: (listener) =>
                    eventBus.on("canvas.focus.changed", (event) => listener(event.focused)),
                hasSelection: () => selection.get().length > 0,
                onSelectionChanged: (listener) =>
                    eventBus.on("selection.changed", (event) =>
                        listener(event.newSelection.length > 0),
                    ),
            }),
        );
    }

    private readonly handleContentChanged = (): void => {
        if (!this.store.isDisposed) {
            this.options.onContentChanged?.();
        }
    };

    private reportWarnings(warnings: DmnWarning[]): void {
        if (this.store.isDisposed) {
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
        if (this.store.isDisposed) {
            throw new NoModelerError();
        }
    }
}

function debounceInputModule(debounceInput: FlushableDebounceInput) {
    return { debounceInput: ["value", debounceInput] };
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
