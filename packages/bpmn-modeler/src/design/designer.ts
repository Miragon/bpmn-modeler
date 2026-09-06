import Modeler from "bpmn-js/lib/Modeler";
import { ImportXMLError, ImportXMLResult, SaveXMLResult } from "bpmn-js/lib/BaseViewer";
import {
    PropertiesPanelModule,
    NeutralPropertiesProviderModule,
    ModeFilterModule,
    CustomGroupsModule,
} from "@miragon/bpmn-modeler-properties-panel";
import { CreateAppendAnythingModule } from "bpmn-js-create-append-anything";
import MinimapModule from "diagram-js-minimap";
import { AppendMenuModule } from "@miragon/bpmn-modeler-append-menu";
import { FlowNavigationModule } from "@miragon/bpmn-modeler-flow-navigation";
import { createClipboardModules } from "@miragon/bpmn-modeler-clipboard";
import { createModelNavigationModule } from "@miragon/bpmn-model-navigation";
import { TranslateModule } from "@miragon/bpmn-modeler-i18n";
import {
    asyncDebounce,
    type AsyncDebounced,
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
import { installCanvasFocusIndicator } from "../canvasFocusIndicator";
import type { ThemeMode } from "../publicApi";
import type { CoreDesignerServices, DesignerOptions } from "./publicApi";

/**
 * Encapsulates one engine-neutral, editable bpmn-js modeler instance — the
 * Design-mode analogue of {@link BpmnModeler} and {@link BpmnViewer}.
 *
 * Wraps the base `bpmn-js/lib/Modeler` (palette, context pad, modelling,
 * keyboard, copy-paste, snapping, searchPad, outline) plus the engine-neutral
 * properties panel (`@miragon/bpmn-modeler-properties-panel` — the full
 * standard-BPMN group set, no Camunda groups) and our neutral UX modules
 * (translate, append menu, flow navigation). It
 * loads none of the Camunda editing stack (camunda-bpmn-js, element templates,
 * token simulation, transaction boundaries, lint), so it never carries an
 * execution platform — the absence of `modeler:executionPlatform` on the model
 * is exactly the mode marker a host routes on.
 *
 * Per-instance by construction: bound to its own `container` and
 * `propertiesPanel.parent`, so several surfaces can coexist on a page. Use
 * {@link createDesigner} as the factory. Every accessor throws
 * {@link NoModelerError} before {@link init} or after {@link destroy}.
 */
export class BpmnDesigner {
    private modeler: Modeler | undefined = undefined;

    private _viewport: ViewportManager | undefined;

    private _selection: SelectionManager | undefined;

    // Drill-down plane tracking, composed into captureViewState/applyViewState
    // and exposed via the public `rootElement` getter for host-driven restore.
    private _rootElement: RootElementManager | undefined;

    // Per-instance theme controller, created lazily on the first setTheme.
    private themeController?: ThemeController;

    // Disposes the canvas-size observer installed by loadDiagram.
    private stopObservingSize?: () => void;

    // Teardown for the container-scoped focus features installed in init().
    private focusDisposers: Array<() => void> = [];

    // The debounced content-saved emitter, live only when `onContentSaved` was
    // supplied. Held so {@link destroy} can cancel a pending trailing export.
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

    /**
     * The three managers backing view-state capture/apply. Reading `viewport`
     * throws {@link NoModelerError} before {@link init}; the root manager is
     * created and cleared in lockstep with it, so the assertion never fires
     * after that guard passes.
     */
    private viewStateManagers() {
        return {
            viewport: this.viewport,
            selection: this.selection,
            rootElement: this._rootElement!,
        };
    }

    /**
     * Creates and mounts the engine-neutral bpmn-js modeler, then wires the
     * viewport/selection managers, focus features, and the debounced
     * content-saved subscription.
     *
     * @internal Construction step invoked by {@link createDesigner}; not part of
     *   the public handle.
     */
    async init(): Promise<void> {
        this.disposeFocusFeatures();

        // Clipboard is a built-in: omitting `clipboard` leaves bpmn-js's native
        // (browser) clipboard in charge; a sandboxed host supplies a bridge.
        const clip = this.options.clipboard;
        const clipModules = clip
            ? createClipboardModules({ element: clip.bridge, text: clip.text })
            : [];
        if (clip) {
            // The label overlay lives outside the bpmn-js DI context, so the DI
            // clipboard modules don't reach it; this document-level polyfill
            // bridges its Cmd/Ctrl+C/V through the text bridge. Idempotent.
            const textBridge = clip.text ?? clip.bridge;
            installContentEditableClipboardPolyfill(
                () => textBridge.requestClipboard(),
                (text) => textBridge.writeClipboard(text),
            );
        }
        const extra = (this.options.additionalModules as any[]) ?? [];

        // Inline the one navigation capability rather than reusing
        // src/capabilityModules.ts — that value-imports code-link and
        // inline-scripting (the latter even side-effect-imports CSS, which would
        // pollute the CSS-free design entry) and takes an Engine. An absent
        // capability registers no provider, so no context-pad entry renders.
        const navigationPort = this.options.capabilities?.modelNavigation;
        const capModules = navigationPort ? [createModelNavigationModule(navigationPort)] : [];

        this.modeler = new Modeler({
            container: this.container,
            propertiesPanel: {
                parent: this.options.propertiesPanel.parent,
                // Mount the FEEL/documentation popups inside the instance
                // container (they default to document.body, outside this
                // instance's theme scope). Safe because the popup is fixed.
                feelPopupContainer: this.container,
            },
            // Ship the minimap collapsed; the toggle lives in the canvas corner.
            // diagram-js-minimap is engine-neutral (no camunda-bpmn-js), so it is
            // a first-class design affordance here rather than editor chrome.
            minimap: { open: false },
            moddleExtensions: this.options.moddleExtensions,
            additionalModules: [
                TranslateModule,
                // Engine-neutral panel (our fork of bpmn-js-properties-panel): the
                // renderer + neutral provider + a design-mode filter (identity here,
                // there is no engine provider to filter) + the host custom-group slot.
                PropertiesPanelModule,
                NeutralPropertiesProviderModule,
                ModeFilterModule,
                CustomGroupsModule,
                // The base create/append overlay our AppendMenuModule decorates.
                // Engine-neutral: with no `elementTemplates` service registered it
                // shows just the standard-BPMN panel, and powers favourites.
                CreateAppendAnythingModule,
                AppendMenuModule,
                FlowNavigationModule,
                MinimapModule,
                ...capModules,
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

        // The package-owned debounced content event: one full export per burst of
        // model changes (300ms / 1000ms maxWait). destroy() cancels a pending
        // trailing export.
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

    /**
     * Composes the container-scopable focus features onto the fresh modeler: the
     * "Escape → focus canvas" guard and the canvas focus reticle. Both are scoped
     * to this instance's canvas container and panel parent so several surfaces on
     * one page never cross-fire.
     */
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
