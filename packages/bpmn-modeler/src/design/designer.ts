import Modeler from "bpmn-js/lib/Modeler";
import { ImportXMLError, ImportXMLResult, SaveXMLResult } from "bpmn-js/lib/BaseViewer";
import {
    PropertiesPanelModule,
    NeutralPropertiesProviderModule,
    ModeFilterModule,
    CustomGroupsModule,
} from "@miragon/bpmn-modeler-properties-panel";
import { CreateAppendAnythingModule } from "bpmn-js-create-append-anything";
import NativeCopyPasteModule from "bpmn-js-native-copy-paste";
import MinimapModule from "diagram-js-minimap";
import TokenSimulationModule from "bpmn-js-token-simulation";
import { AppendMenuModule } from "@miragon/bpmn-modeler-append-menu";
import { FlowNavigationModule } from "@miragon/bpmn-modeler-flow-navigation";
import { createBpmnLayoutModule } from "@miragon/bpmn-modeler-layout";
import type { CleanupService, LayoutOutcome, Layouter } from "@miragon/bpmn-modeler-layout";
import { createClipboardModules } from "@miragon/bpmn-modeler-clipboard";
import { createModelNavigationModule } from "@miragon/bpmn-model-navigation";
import { TranslateModule } from "@miragon/bpmn-modeler-i18n";
import {
    asyncDebounce,
    type AsyncDebounced,
    installCanvasFocusIndicator,
    NoModelerError,
    observeCanvasSize,
} from "@miragon/bpmn-modeler-types";
import { installContentEditableClipboardPolyfill } from "../propertiesPanelClipboard";
import { ThemeController } from "../theme";
import { ViewportManager } from "../viewport";
import { SelectionManager } from "../selection";
import { RootElementManager } from "../rootElement";
import {
    applyViewState as applyViewStateComposition,
    captureViewState as captureViewStateComposition,
    type ViewState,
} from "../viewState";
import { installKeyboardFocus } from "../keyboardFocus";
import { buildLintModules } from "../lintModules";
import { createLintHandleMethods, type LintHandleMethods } from "../lintHandle";
import type { LintConfigService } from "../bpmnlint/LintConfigService";
import type { BpmnlintConfig, CleanupItem, LintResults } from "@miragon/bpmn-modeler-types";
import type { ThemeMode } from "../publicApi";
import type { CoreDesignerServices, DesignerOptions } from "./publicApi";

/**
 * An independent, editable BPMN surface without an execution platform.
 * Create it with {@link createDesigner}; accessors require a live instance.
 */
export class BpmnDesigner {
    private modeler: Modeler | undefined = undefined;

    private _viewport: ViewportManager | undefined;

    private _selection: SelectionManager | undefined;

    private _rootElement: RootElementManager | undefined;

    private themeController?: ThemeController;

    private stopObservingSize?: () => void;

    private focusDisposers: Array<() => void> = [];

    // Retain the debouncer so destroy can cancel a pending export.
    private contentSaved?: AsyncDebounced<() => Promise<void>>;

    /**
     * @param container The canvas host element (bpmn-js `container`).
     * @param options Per-instance config — see {@link DesignerOptions}.
     */
    constructor(
        private readonly container: HTMLElement,
        private readonly options: DesignerOptions,
    ) {}

    /** Access the viewport manager after {@link init}. */
    get viewport(): ViewportManager {
        if (!this._viewport) {
            throw new NoModelerError();
        }
        return this._viewport;
    }

    /** Access the selection manager after {@link init}. */
    get selection(): SelectionManager {
        if (!this._selection) {
            throw new NoModelerError();
        }
        return this._selection;
    }

    /** Access the root element manager after {@link init}. */
    get rootElement(): RootElementManager {
        if (!this._rootElement) {
            throw new NoModelerError();
        }
        return this._rootElement;
    }

    /**
     * Snapshots the drill-down plane, viewbox, and selection so they survive an
     * instance switch (View ↔ Design ↔ Implement) — capture here, `destroy()`,
     * create the next instance, `loadDiagram`, then {@link applyViewState}. See
     * {@link ViewState} for the plane/selection degradation rules.
     */
    captureViewState(): ViewState {
        return captureViewStateComposition(this.viewStateManagers());
    }

    /**
     * Re-applies a {@link captureViewState} snapshot, restoring plane, viewbox,
     * and selection in the required root → viewport → selection order.
     */
    applyViewState(state: ViewState): void {
        applyViewStateComposition(this.viewStateManagers(), state);
    }

    // Accessing viewport guards initialization; all three managers share its lifecycle.
    private viewStateManagers() {
        return {
            viewport: this.viewport,
            selection: this.selection,
            rootElement: this._rootElement!,
        };
    }

    /** @internal */
    async init(): Promise<void> {
        this.disposeFocusFeatures();

        // Register NativeCopyPaste even with a bridge: the bridge module expects to disable it.
        const clip = this.options.clipboard;
        const clipModules = clip
            ? createClipboardModules({ element: clip.bridge, text: clip.text })
            : [];
        if (clip) {
            // The FEEL editor sits outside bpmn-js DI and needs the document-level text bridge.
            const textBridge = clip.text ?? clip.bridge;
            installContentEditableClipboardPolyfill(
                () => textBridge.requestClipboard(),
                (text) => textBridge.writeClipboard(text),
            );
        }
        const extra = (this.options.additionalModules as any[]) ?? [];

        // capabilityModules imports engine features and CSS, which must stay out of the design entry.
        const navigationPort = this.options.capabilities?.modelNavigation;
        const capModules = navigationPort ? [createModelNavigationModule(navigationPort)] : [];

        this.modeler = new Modeler({
            container: this.container,
            propertiesPanel: {
                parent: this.options.propertiesPanel.parent,
                // Keep popups within this instance's theme scope instead of document.body.
                feelPopupContainer: this.container,
            },
            minimap: { open: false },
            moddleExtensions: this.options.moddleExtensions,
            additionalModules: [
                TranslateModule,
                PropertiesPanelModule,
                NeutralPropertiesProviderModule,
                ModeFilterModule,
                CustomGroupsModule,
                CreateAppendAnythingModule,
                AppendMenuModule,
                FlowNavigationModule,
                // Formatting is pure geometry, so it is engine-neutral and
                // belongs on this surface as much as on the modeler.
                createBpmnLayoutModule(),
                MinimapModule,
                TokenSimulationModule,
                // Design never enabled linting implicitly, so omission needs no migration notice.
                ...buildLintModules(
                    this.options.linting,
                    { engine: undefined, mode: "design" },
                    {
                        onLintResults: this.options.onLintResults,
                        onLintingToggled: this.options.onLintingToggled,
                    },
                    { nudgeWhenOmitted: false },
                ),
                ...capModules,
                NativeCopyPasteModule,
                ...clipModules,
                ...extra,
            ],
        });

        const accessor = <T>(name: string): T => this.getModeler().get<T>(name);
        this._viewport = new ViewportManager(accessor);
        this._selection = new SelectionManager(accessor);
        this._rootElement = new RootElementManager(accessor);

        this.installFocusFeatures();

        if (this.options.favouriteBpmnElements) {
            const appendMenuOverride = this.getModeler().get<any>("appendMenuOverride", false);
            appendMenuOverride?.setFavourites(this.options.favouriteBpmnElements);
        }

        const onContentSaved = this.options.onContentSaved;
        if (onContentSaved) {
            this.contentSaved = asyncDebounce(
                async () => onContentSaved({ xml: await this.exportDiagram() }),
                300,
                { maxWait: 1000 },
            );
            this.getModeler()
                .get<any>("eventBus")
                .on("commandStack.changed", () => void this.contentSaved!());
        }
    }

    private installFocusFeatures(): void {
        const canvas = this.getModeler().get<{
            getContainer(): HTMLElement;
            focus(): void;
            isFocused(): boolean;
        }>("canvas");
        const canvasContainer = canvas.getContainer();
        const eventBus = () => this.getModeler().get<any>("eventBus");
        const selection = () => this.getModeler().get<{ get(): unknown[] }>("selection");

        this.focusDisposers.push(
            installKeyboardFocus({
                roots: [canvasContainer, this.options.propertiesPanel.parent],
                focusCanvas: () => canvas.focus(),
                isCanvasFocused: () => canvas.isFocused(),
                hasSelection: () => selection().get().length > 0,
                clearSelection: () =>
                    this.getModeler()
                        .get<{ select(elements: null): void }>("selection")
                        .select(null),
                isSearchPadOpen: () =>
                    this.getModeler().get<{ isOpen(): boolean }>("searchPad").isOpen(),
                closeSearchPad: () => this.getModeler().get<{ close(): void }>("searchPad").close(),
            }),
        );

        this.focusDisposers.push(
            installCanvasFocusIndicator({
                parent: canvasContainer,
                isFocused: () => canvas.isFocused(),
                onFocusChanged: (listener) =>
                    eventBus().on("canvas.focus.changed", (e: { focused: boolean }) =>
                        listener(e.focused),
                    ),
                hasSelection: () => selection().get().length > 0,
                onSelectionChanged: (listener) =>
                    eventBus().on("selection.changed", (e: { newSelection: unknown[] }) =>
                        listener(e.newSelection.length > 0),
                    ),
            }),
        );
    }

    private disposeFocusFeatures(): void {
        for (const dispose of this.focusDisposers.splice(0)) {
            dispose();
        }
    }

    async newDiagram(): Promise<ImportXMLResult> {
        return this.getModeler().createDiagram();
    }

    async loadDiagram(xml: string): Promise<ImportXMLResult> {
        try {
            const result = await this.getModeler().importXML(xml);
            // The host may mount the container before laying it out, so the box
            // can be zero when the import lands; the fit retries until it isn't.
            this.stopObservingSize?.();
            const canvas = this.getModeler().get<any>("canvas");
            this.stopObservingSize = observeCanvasSize(canvas, canvas.getContainer(), {
                applyInitialViewport: () => this._viewport!.fitViewport(),
            });
            this._viewport!.fitViewport();
            return result;
        } catch (error: unknown) {
            if ((error as ImportXMLError).warnings) {
                const importError = error as ImportXMLError;
                throw new Error(`${importError.message} ${importError.warnings}`, {
                    cause: error,
                });
            }
            throw error;
        }
    }

    async exportDiagram(): Promise<string> {
        const result: SaveXMLResult = await this.getModeler().saveXML({ format: true });
        if (result.xml) {
            return result.xml;
        } else if (result.error) {
            throw result.error;
        }
        throw new Error("Failed to serialise the diagram!");
    }

    /** @see BpmnDesignerHandle.formatDiagram */
    async formatDiagram(): Promise<LayoutOutcome> {
        return this.getModeler().get<Layouter>("bpmnLayouter").format();
    }

    /** @see BpmnDesignerHandle.cleanupDiagram */
    cleanupDiagram(options?: { apply?: boolean }): CleanupItem[] {
        const cleanup = this.getModeler().get<CleanupService>("bpmnCleanup");
        return options?.apply ? cleanup.apply() : cleanup.inspect();
    }

    async getDiagramSvg(): Promise<string> {
        const result = await this.getModeler().saveSVG();
        return result.svg;
    }

    /**
     * Switches the colour theme live. Toggles `data-bpmn-theme` on this
     * instance's container + panel parent and mirrors the choice to a legacy
     * page-global `#theme-link` when present.
     */
    setTheme(theme: ThemeMode): void {
        if (!this.themeController) {
            this.themeController = new ThemeController([
                this.container,
                this.options.propertiesPanel.parent,
            ]);
        }
        this.themeController.setMode(theme);
    }

    /**
     * Returns a service from the modeler's DI container. The
     * {@link CoreDesignerServices} names are semver-stable; every other name is
     * an unstable escape hatch.
     */
    getService<K extends keyof CoreDesignerServices>(name: K): CoreDesignerServices[K];
    getService<T = unknown>(name: string): T;
    getService(name: string): any {
        return this.getModeler().get(name);
    }

    /**
     * Feeds host-computed lint results to the in-canvas overlays (external tier).
     * A no-op with a warning when the designer was created without a lint module.
     */
    applyLintResults(results: LintResults | null): void {
        this.lintHandle().applyLintResults(results);
    }

    /**
     * Renders the host's user-disabled lint state (external tier). A no-op with a
     * warning when the designer was created without a lint module.
     */
    applyLintingDisabled(): void {
        this.lintHandle().applyLintingDisabled();
    }

    /**
     * Starts (or restarts) the in-page linter on host instruction. A no-op with a
     * warning when the designer was created without a lint module.
     */
    startInPageLinting(config?: BpmnlintConfig, configToken?: string): void {
        this.lintHandle().startInPageLinting(config, configToken);
    }

    private lintHandle(): LintHandleMethods {
        return createLintHandleMethods(
            () => this.getModeler().get<LintConfigService>("bpmnLintConfig", false) ?? undefined,
            (message) => console.warn(message),
        );
    }

    /**
     * Tears the instance down: cancels the debounced export, stops the
     * canvas-size observer, disposes the focus features and theme controller, and
     * destroys the underlying bpmn-js modeler. A destroyed facade throws
     * {@link NoModelerError} from every accessor.
     */
    destroy(): void {
        this.contentSaved?.cancel();
        this.stopObservingSize?.();
        this.stopObservingSize = undefined;
        this.themeController?.dispose();
        this.disposeFocusFeatures();
        this.modeler?.destroy();
        this.modeler = undefined;
        this._viewport = undefined;
        this._selection = undefined;
        this._rootElement = undefined;
    }

    /**
     * @throws {NoModelerError} If {@link init} has not been called (or the
     *   instance was destroyed).
     */
    private getModeler(): Modeler {
        if (!this.modeler) {
            throw new NoModelerError();
        }
        return this.modeler;
    }
}
