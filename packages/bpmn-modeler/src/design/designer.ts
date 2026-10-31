import Modeler from "bpmn-js/lib/Modeler";
import type { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
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
import type { LayoutOutcome } from "@miragon/bpmn-modeler-layout";
import { createModelNavigationModule } from "@miragon/bpmn-model-navigation";
import { createDefinitionSearchModule } from "@miragon/bpmn-modeler-definition-search";
import { TranslateModule } from "@miragon/bpmn-modeler-i18n";
import { DisposableStore } from "@miragon/bpmn-modeler-types";
import type { ViewportManager } from "../viewport";
import type { SelectionManager } from "../selection";
import type { RootElementManager } from "../rootElement";
import type { ViewState } from "../viewState";
import { buildLintModules } from "../lintModules";
import { createPopupMenuAnnotationsModule } from "../popupMenuAnnotations";
import type { LintHandleMethods } from "../lintHandle";
import { wireContentSaved } from "../contentSaved";
import { exportFormattedXml, exportSvg, importDiagram } from "../diagramXml";
import {
    applyFavouriteBpmnElements,
    cleanupSurfaceDiagram,
    createSurfaceLintHandle,
    formatSurfaceDiagram,
    installClipboardSupport,
    subscribeCommandStackChanged,
    subscribeFormatted,
} from "../editableSurface";
import { SurfaceCore } from "../surfaceCore";
import { createReporter, type SurfaceReporter } from "../reporting";
import type { BpmnlintConfig, CleanupOutcome, LintResults } from "@miragon/bpmn-modeler-types";
import type { ThemeMode } from "../publicApi";
import type { CoreDesignerServices, DesignerOptions } from "./publicApi";

/**
 * An independent, editable BPMN surface without an execution platform.
 * Create it with {@link createDesigner}; accessors require a live instance.
 */
export class BpmnDesigner {
    private readonly core: SurfaceCore<Modeler>;

    private readonly reporter: SurfaceReporter;

    private readonly lintHandle: LintHandleMethods;

    private readonly store = new DisposableStore();

    /**
     * @param container The canvas host element (bpmn-js `container`).
     * @param options Per-instance config — see {@link DesignerOptions}.
     */
    constructor(
        private readonly container: HTMLElement,
        private readonly options: DesignerOptions,
    ) {
        this.core = new SurfaceCore(container, [container, options.propertiesPanel.parent]);
        this.reporter = createReporter({ onError: options.onError });
        this.lintHandle = createSurfaceLintHandle(this.core, this.reporter);
    }

    /** Access the viewport manager after {@link init}. */
    get viewport(): ViewportManager {
        return this.core.viewport;
    }

    /** Access the selection manager after {@link init}. */
    get selection(): SelectionManager {
        return this.core.selection;
    }

    /** Access the root element manager after {@link init}. */
    get rootElement(): RootElementManager {
        return this.core.rootElement;
    }

    /**
     * Snapshots the drill-down plane, viewbox, and selection so they survive an
     * instance switch (View ↔ Design ↔ Implement) — capture here, `destroy()`,
     * create the next instance, `loadDiagram`, then {@link applyViewState}. See
     * {@link ViewState} for the plane/selection degradation rules.
     */
    captureViewState(): ViewState {
        return this.core.captureViewState();
    }

    /**
     * Re-applies a {@link captureViewState} snapshot, restoring plane, viewbox,
     * and selection in the required root → viewport → selection order.
     */
    applyViewState(state: ViewState): void {
        this.core.applyViewState(state);
    }

    /** @internal */
    async init(): Promise<void> {
        // Register NativeCopyPaste even with a bridge: the bridge module expects to disable it.
        const clipModules = installClipboardSupport(this.store, this.options.clipboard, [
            this.container,
            this.options.propertiesPanel.parent,
        ]);
        const extra = (this.options.additionalModules as unknown[]) ?? [];

        // capabilityModules imports engine features and CSS, which must stay out of the design entry.
        const { modelNavigation, definitionSearch } = this.options.capabilities ?? {};
        const capModules = [
            ...(modelNavigation ? [createModelNavigationModule(modelNavigation)] : []),
            ...(definitionSearch ? [createDefinitionSearchModule(definitionSearch)] : []),
        ];

        this.core.allocate(
            this.store,
            () => this.constructModeler(clipModules, capModules, extra),
            {
                extraRoots: [this.options.propertiesPanel.parent],
                hasSearchPad: true,
            },
        );

        if (this.options.favouriteBpmnElements) {
            this.setFavouriteBpmnElements(this.options.favouriteBpmnElements);
        }

        const onContentSaved = this.options.onContentSaved;
        if (onContentSaved) {
            wireContentSaved({
                store: this.store,
                eventBus: this.core.service("eventBus"),
                exportDiagram: () => this.exportDiagram(),
                onContentSaved,
                reporter: this.reporter,
            });
        }
    }

    private constructModeler(
        clipModules: unknown[],
        capModules: unknown[],
        extra: unknown[],
    ): Modeler {
        return new Modeler({
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
                createPopupMenuAnnotationsModule(),
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
    }

    async newDiagram(): Promise<ImportXMLResult> {
        const result = await this.core.instance.createDiagram();
        this.core.armInitialViewport();
        return result;
    }

    async loadDiagram(xml: string): Promise<ImportXMLResult> {
        const result = await importDiagram(this.core.instance, xml);
        this.core.armInitialViewport();
        return result;
    }

    async exportDiagram(): Promise<string> {
        return exportFormattedXml(this.core.instance);
    }

    /** @see BpmnDesignerHandle.formatDiagram */
    async formatDiagram(): Promise<LayoutOutcome> {
        return formatSurfaceDiagram(this.core);
    }

    /** @see BpmnDesignerHandle.cleanupDiagram */
    cleanupDiagram(options?: { apply?: boolean }): CleanupOutcome {
        return cleanupSurfaceDiagram(this.core, options);
    }

    async getDiagramSvg(): Promise<string> {
        return exportSvg(this.core.instance);
    }

    /** @see BpmnDesignerHandle.setFavouriteBpmnElements */
    setFavouriteBpmnElements(types: readonly string[]): void {
        applyFavouriteBpmnElements(this.core, types);
    }

    /**
     * Switches the colour theme live. Toggles `data-bpmn-theme` on this
     * instance's container + panel parent and mirrors the choice to a legacy
     * page-global `#theme-link` when present.
     */
    setTheme(theme: ThemeMode): void {
        this.core.setTheme(this.store, theme);
    }

    /**
     * Returns a service from the modeler's DI container. The
     * {@link CoreDesignerServices} names are semver-stable; every other name is
     * an unstable escape hatch.
     */
    getService<K extends keyof CoreDesignerServices>(name: K): CoreDesignerServices[K];
    getService<T = unknown>(name: string): T;
    getService<T = unknown>(name: string): T {
        return this.core.service<T>(name);
    }

    /**
     * Feeds host-computed lint results to the in-canvas overlays (external tier).
     * A no-op with a warning when the designer was created without a lint module.
     */
    applyLintResults(results: LintResults | null): void {
        this.lintHandle.applyLintResults(results);
    }

    /**
     * Renders the host's user-disabled lint state (external tier). A no-op with a
     * warning when the designer was created without a lint module.
     */
    applyLintingDisabled(): void {
        this.lintHandle.applyLintingDisabled();
    }

    /**
     * Starts (or restarts) the in-page linter on host instruction. A no-op with a
     * warning when the designer was created without a lint module.
     */
    startInPageLinting(config?: BpmnlintConfig, configToken?: string): void {
        this.lintHandle.startInPageLinting(config, configToken);
    }

    /** @see BpmnDesignerHandle.onCommandStackChanged */
    onCommandStackChanged(listener: () => void): () => void {
        return subscribeCommandStackChanged(this.core, listener);
    }

    /** @see BpmnDesignerHandle.onFormatted */
    onFormatted(listener: (outcome: LayoutOutcome) => void): () => void {
        return subscribeFormatted(this.core, listener);
    }

    /**
     * Tears the instance down: disposes every registered lifecycle resource (the
     * debounced export, canvas-size observer, focus features, theme controller,
     * clipboard polyfill, and the underlying bpmn-js modeler) in reverse order.
     * Idempotent.
     *
     * @see BpmnDesignerHandle.destroy
     */
    destroy(): void {
        this.store.dispose();
        this.core.releaseManagers();
    }
}
