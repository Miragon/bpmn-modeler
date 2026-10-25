import Modeler from "bpmn-js/lib/Modeler";
import type { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
import type { ModuleDeclaration } from "didi";
import TokenSimulationModule from "bpmn-js-token-simulation";
import { ElementTemplateChooserModule } from "@miragon/bpmn-modeler-element-template-chooser";
import { AppendMenuModule } from "@miragon/bpmn-modeler-append-menu";
import type { CodeLinkMapClient } from "@miragon/bpmn-modeler-code-link";
import { FlowNavigationModule } from "@miragon/bpmn-modeler-flow-navigation";
import { createBpmnLayoutModule } from "@miragon/bpmn-modeler-layout";
import type { LayoutOutcome } from "@miragon/bpmn-modeler-layout";
import type { CleanupOutcome } from "@miragon/bpmn-modeler-types";
// The full panel conflicts with Camunda's propertiesPanel service. Deep imports also avoid
// its TSX renderer, whose JSX runtime does not resolve in Vite development builds.
import { ModeFilterModule } from "@miragon/bpmn-modeler-properties-panel/modeFilter/ModeFilterProvider";
import { CustomGroupsModule } from "@miragon/bpmn-modeler-properties-panel/customGroups/CustomGroupsRegistry";
import { TranslateModule } from "@miragon/bpmn-modeler-i18n";
import {
    BpmnlintConfig,
    BpmnModelerSetting,
    DisposableStore,
    Engine,
    getLatestVersion,
    LintResults,
    OpenScriptEditorRef,
    ScriptKind,
    ScriptTaskScript,
    subscribe,
} from "@miragon/bpmn-modeler-types";
import {
    collectInlineScriptTasks,
    describeScriptSurface,
    OpenScriptEditorsStore,
    resolveScriptWriteTarget,
    ScriptSourceWatcher,
} from "@miragon/bpmn-modeler-inline-scripting";
import type { ScriptField, ScriptTaskBusinessObject } from "@miragon/bpmn-modeler-inline-scripting";
import { buildLintModules } from "./lintModules";
import {
    BPMN_TAB,
    createPopupMenuAnnotationsModule,
    ReplaceTemplatesTabModule,
} from "./popupMenuAnnotations";
import type { LintHandleMethods } from "./lintHandle";
import { capabilityModules } from "./capabilityModules";
import { wireContentSaved } from "./contentSaved";
import { exportFormattedXml, exportSvg, importDiagram } from "./diagramXml";
import {
    applyFavouriteBpmnElements,
    cleanupSurfaceDiagram,
    createSurfaceLintHandle,
    formatSurfaceDiagram,
    installClipboardSupport,
} from "./editableSurface";
import { createReporter, type SurfaceReporter } from "./reporting";
import { SurfaceCore } from "./surfaceCore";
import type { ViewportManager } from "./viewport";
import type { SelectionManager } from "./selection";
import type { RootElementManager } from "./rootElement";
import type { ViewState } from "./viewState";
import { deriveEngines } from "./engines";
import { loadEngineStack } from "./engineStacks";
import { initialDiagram } from "./initialDiagram";
import { applyMode, normalizeMode, MODE_ATTRIBUTE, type ModePorts, type ModelerMode } from "./mode";
import { ModeUiModule } from "./modeModules";
import { DrilldownFitModule } from "./viewState";
import type { CreateModelerOptions } from "./createModeler";
import type { CoreModelerServices, ThemeMode } from "./publicApi";
import type { LintConfigService } from "./bpmnlint/LintConfigService";

// Structural slivers of non-core bpmn-js DI services — only the members this
// facade calls, so the untyped `.get<any>` reaches are gone without adopting a
// full didi service map (see docs/adr/engineering-practices.md#private-upstream-apis).
interface TransactionBoundariesService {
    readonly active: boolean;
    show(): void;
    hide(): void;
}
interface ElementTemplatesLoaderService {
    setTemplates(templates: object[]): void;
}
interface AlignToOriginService {
    align(): void;
}
interface ElementTemplatesEngineService {
    setEngines(engines: ReturnType<typeof deriveEngines>): void;
}
interface ScriptModelElement {
    businessObject: ScriptTaskBusinessObject;
}
interface ScriptModelElementRegistry {
    get(id: string): ScriptModelElement | undefined;
}
interface ScriptModeling {
    updateModdleProperties(
        element: ScriptModelElement,
        moddleElement: unknown,
        properties: Record<string, unknown>,
    ): void;
}

const DEFAULT_SETTINGS: BpmnModelerSetting = {
    alignToOrigin: false,
    showTransactionBoundaries: true,
    colorTheme: "automatic",
};

const ALIGN_TO_ORIGIN_OPTIONS = {
    alignOnSave: false,
    offset: 150,
    tolerance: 50,
};

/**
 * An independent Camunda BPMN modeler with its own canvas and properties panel.
 * Create it with {@link createModeler}; accessors require a live instance.
 */
export class BpmnModeler {
    private settings: BpmnModelerSetting = { ...DEFAULT_SETTINGS };

    private engine: Engine | undefined = undefined;

    private readonly core: SurfaceCore<Modeler>;

    private readonly reporter: SurfaceReporter;

    private readonly lintHandle: LintHandleMethods;

    // Reset on every init() so a re-entry starts from a clean disposal ledger.
    private store = new DisposableStore();

    /**
     * @param container The canvas host element (bpmn-js `container`).
     * @param options Per-instance config — see {@link CreateModelerOptions}.
     */
    constructor(
        private readonly container: HTMLElement,
        private readonly options: CreateModelerOptions,
    ) {
        this.core = new SurfaceCore(container, [container, options.propertiesPanel.parent]);
        this.reporter = createReporter({ onWarning: options.onWarning, onError: options.onError });
        this.lintHandle = createSurfaceLintHandle(this.core, this.reporter);
    }

    /**
     * Access the viewport manager after {@link init}.
     */
    get viewport(): ViewportManager {
        return this.core.viewport;
    }

    /**
     * Access the selection manager after {@link init}.
     */
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

    /**
     * @internal Loads the engine's module stack before constructing it.
     * @throws {UnsupportedEngineError} If the engine string is not recognised.
     */
    async init(): Promise<void> {
        const engine = this.options.engine;
        this.store.dispose();
        const store = new DisposableStore();
        this.store = store;

        const engineStack = await loadEngineStack(engine);
        // destroy() or a re-entrant init() replaced the store while the stack loaded.
        if (this.store !== store || store.isDisposed) {
            return;
        }

        // Inject the panel root so script controls cannot target a sibling modeler's panel.
        const propertiesPanelRootModule = {
            propertiesPanelRoot: ["value", this.options.propertiesPanel.parent],
        };
        const commonModules = [
            TranslateModule,
            TokenSimulationModule,
            ...buildLintModules(
                this.options.linting,
                { engine, mode: normalizeMode(this.options.mode) },
                {
                    onLintResults: this.options.onLintResults,
                    onLintingToggled: this.options.onLintingToggled,
                },
            ),
            ElementTemplateChooserModule,
            AppendMenuModule,
            createPopupMenuAnnotationsModule(engineStack.popupMenuAnnotations),
            ReplaceTemplatesTabModule,
            FlowNavigationModule,
            createBpmnLayoutModule(),
            propertiesPanelRootModule,
            ModeFilterModule,
            CustomGroupsModule,
            ModeUiModule,
            DrilldownFitModule,
        ];
        const capModules = capabilityModules(engine, this.options.capabilities);
        const clipModules = installClipboardSupport(this.store, this.options.clipboard, [
            this.container,
            this.options.propertiesPanel.parent,
        ]);
        const extra = (this.options.additionalModules as ModuleDeclaration[]) ?? [];

        const modelerOptions = {
            container: this.container,
            propertiesPanel: {
                ...engineStack.propertiesPanelDefaults,
                parent: this.options.propertiesPanel.parent,
                // Keep popups within this instance's theme scope instead of document.body.
                feelPopupContainer: this.container,
            },
            popupMenu: { defaultTab: BPMN_TAB },
            alignToOrigin: ALIGN_TO_ORIGIN_OPTIONS,
            moddleExtensions: { ...engineStack.moddleExtensions, ...this.options.moddleExtensions },
            // The panel defaults to design if this config is absent.
            propertiesPanelMode: normalizeMode(this.options.mode),
        };

        this.engine = engine;

        const additionalModules = [
            ...engineStack.upstreamModules,
            ...commonModules,
            ...engineStack.engineModules,
            ...capModules,
            ...clipModules,
            ...extra,
        ];
        this.core.allocate(
            this.store,
            () => this.constructModeler(modelerOptions, additionalModules),
            {
                extraRoots: [this.options.propertiesPanel.parent],
                handleGlobalEscape: this.options.handleGlobalEscape ?? false,
                hasSearchPad: true,
            },
        );

        // Subscribe before initial templates are supplied so their validation errors are observed.
        const onElementTemplatesErrors = this.options.onElementTemplatesErrors;
        if (onElementTemplatesErrors) {
            this.store.add(
                subscribe(
                    this.getModeler(),
                    "elementTemplates.errors",
                    (event: { errors?: unknown[] }) => {
                        onElementTemplatesErrors(event.errors ?? []);
                    },
                ),
            );
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

        // Apply before the first paint to avoid flashing engine controls in design mode.
        this.setModeAttribute(normalizeMode(this.options.mode));
        this.store.add(() => {
            this.container.removeAttribute(MODE_ATTRIBUTE);
            this.options.propertiesPanel.parent.removeAttribute(MODE_ATTRIBUTE);
        });
    }

    private constructModeler(modelerOptions: object, additionalModules: unknown[]): Modeler {
        return new Modeler({
            ...modelerOptions,
            additionalModules: additionalModules as ModuleDeclaration[],
        });
    }

    /**
     * Feeds host-computed lint results to the in-canvas overlays (external tier).
     * Any push switches an in-page instance to the external tier. `null`
     * deactivates linting (no `.bpmnlintrc` / read failure). A no-op with a warning
     * when the instance was created without a lint module (no lint service).
     */
    applyLintResults(results: LintResults | null): void {
        this.lintHandle.applyLintResults(results);
    }

    /**
     * Renders the host's user-disabled lint state (external tier): clears overlays
     * and shows the re-enable chip. A no-op with a warning when the instance was
     * created without a lint module.
     */
    applyLintingDisabled(): void {
        this.lintHandle.applyLintingDisabled();
    }

    /**
     * Starts (or restarts) the in-page linter on host instruction — the handback
     * when the host finds no workspace `.bpmnlintrc`. Mirrors
     * {@link applyLintResults}: a no-op with a warning when the instance was
     * created without a lint module (no lint service). Never re-enables a
     * user-disabled linter (the service guards that); any later host push still
     * wins over the in-page run.
     */
    startInPageLinting(config?: BpmnlintConfig, configToken?: string): void {
        this.lintHandle.startInPageLinting(config, configToken);
    }

    /**
     * Tears the instance down: disposes every registered lifecycle resource (the
     * debounced export, focus features, event subscriptions, mode attributes,
     * theme controller, clipboard polyfill, and the underlying bpmn-js modeler)
     * in reverse order. Idempotent.
     *
     * @see BpmnModelerHandle.destroy
     */
    destroy(): void {
        this.store.dispose();
        this.core.releaseManagers();
    }

    /** @internal Use onContentSaved for debounced content notifications. */
    onCommandStackChanged(cb: () => void): () => void {
        return subscribe(this.getService("eventBus"), "commandStack.changed", cb);
    }

    /**
     * Returns the live moddle definitions tree (`bpmn:Definitions` root) so
     * callers can walk the in-memory model — e.g. to extract process variables
     * for script IntelliSense — without round-tripping through XML.
     */
    getDefinitions(): ReturnType<Modeler["getDefinitions"]> {
        return this.getModeler().getDefinitions();
    }

    /** @internal */
    collectInlineScriptTasks(): ScriptTaskScript[] {
        return collectInlineScriptTasks(this.getService("elementRegistry"));
    }

    async newDiagram(): Promise<ImportXMLResult> {
        const version = this.options.engineVersion ?? getLatestVersion(this.engine!);
        const result = await this.getModeler().importXML(initialDiagram(this.engine!, version));
        this.refreshAfterImport();
        return result;
    }

    async loadDiagram(bpmn: string): Promise<ImportXMLResult> {
        const result = await importDiagram(this.getModeler(), bpmn);
        this.refreshAfterImport();
        return result;
    }

    private refreshAfterImport(): void {
        this.showTransactionBoundariesIfEnabled();
        this.applyEnginesFromDefinitions();
        this.core.armInitialViewport();
    }

    // Import clears the overlays, so every import re-renders the boundaries.
    private showTransactionBoundariesIfEnabled(): void {
        if (this.engine === "c7" && this.settings.showTransactionBoundaries) {
            this.getModeler().get<TransactionBoundariesService>("transactionBoundaries").show();
        }
    }

    async exportDiagram(): Promise<string> {
        return exportFormattedXml(this.getModeler());
    }

    async getDiagramSvg(): Promise<string> {
        return exportSvg(this.getModeler());
    }

    /**
     * Rearranges the diagram left to right, applied as one undoable step.
     *
     * @see BpmnModelerHandle.formatDiagram
     */
    async formatDiagram(): Promise<LayoutOutcome> {
        return formatSurfaceDiagram(this.core);
    }

    /**
     * Reports or removes diagram garbage.
     *
     * @see BpmnModelerHandle.cleanupDiagram
     */
    cleanupDiagram(options?: { apply?: boolean }): CleanupOutcome {
        return cleanupSurfaceDiagram(this.core, options);
    }

    setElementTemplates(templates: object[]): void {
        this.getModeler()
            .get<ElementTemplatesLoaderService>("elementTemplatesLoader")
            .setTemplates(templates);
    }

    setSettings(settings: Partial<BpmnModelerSetting> | undefined): void {
        if (!settings) {
            return;
        }
        this.getModeler();
        this.settings = { ...this.settings, ...settings };

        // colorTheme stays inert here; the host controls theme through setTheme.

        const showTransactionBoundaries = settings.showTransactionBoundaries;
        if (this.engine === "c7" && showTransactionBoundaries !== undefined) {
            const transactionBoundaries =
                this.getModeler().get<TransactionBoundariesService>("transactionBoundaries");
            // Hosts re-send every setting on any change; upstream show() is not idempotent.
            if (showTransactionBoundaries !== transactionBoundaries.active) {
                if (showTransactionBoundaries) {
                    transactionBoundaries.show();
                } else {
                    transactionBoundaries.hide();
                }
            }
        }

        if (settings.favouriteBpmnElements !== undefined) {
            applyFavouriteBpmnElements(this.core, settings.favouriteBpmnElements);
        }
    }

    /** @see BpmnModelerHandle.setFavouriteBpmnElements */
    setFavouriteBpmnElements(types: readonly string[]): void {
        this.setSettings({ favouriteBpmnElements: [...types] });
    }

    /** @internal */
    alignElementsToOrigin(): void {
        if (this.settings.alignToOrigin) {
            this.getModeler().get<AlignToOriginService>("alignToOrigin").align();
        }
    }

    /**
     * Returns a service from the modeler's dependency injection container.
     *
     * @remarks The {@link CoreModelerServices} names are semver-stable and
     *   resolve to their upstream-documented shapes. Every other name is an
     *   unstable escape hatch — kept public deliberately so advanced
     *   integrations are not blocked, but DI service names can change across
     *   minor versions. Prefer a typed option/method where one exists.
     * @param name The DI service name (e.g. `"canvas"` or `"customTranslator"`).
     * @returns The service instance.
     */
    getService<K extends keyof CoreModelerServices>(name: K): CoreModelerServices[K];
    getService<T = unknown>(name: string): T;
    getService<T = unknown>(name: string): T {
        return this.core.service<T>(name);
    }

    /** @internal */
    updateScriptFormat(
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        scriptFormat: string,
    ): void {
        const element = this.findScriptElement(elementId);
        if (element) {
            this.writeScriptField(element, elementId, kind, listenerIndex, "format", scriptFormat);
        }
    }

    /** @internal */
    updateScriptContent(
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        content: string,
    ): void {
        const element = this.findScriptElement(elementId);
        if (!element) {
            return;
        }
        // commandStack.changed fires during the write; set the baseline first to avoid echoing our own edit.
        this.getModeler()
            .get<ScriptSourceWatcher>("scriptSourceWatcher", false)
            ?.noteApplied(elementId, kind, listenerIndex, content);
        this.writeScriptField(element, elementId, kind, listenerIndex, "content", content);
    }

    private findScriptElement(elementId: string): ScriptModelElement | undefined {
        const element = this.getModeler()
            .get<ScriptModelElementRegistry>("elementRegistry")
            .get(elementId);
        if (!element) {
            this.reporter.warn(`Element not found: ${elementId}`);
        }
        return element;
    }

    private writeScriptField(
        element: ScriptModelElement,
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        field: ScriptField,
        value: string,
    ): void {
        const target = resolveScriptWriteTarget(element.businessObject, kind, listenerIndex, field);
        if (!target) {
            this.reporter.warn(
                `${describeScriptSurface(elementId, kind, listenerIndex)} has no inline script`,
            );
            return;
        }
        this.getModeler()
            .get<ScriptModeling>("modeling")
            .updateModdleProperties(element, target.moddleElement, {
                [target.propertyName]: value,
            });
    }

    /** @internal C7 only; C8 does not register the script-editor store. */
    applyOpenScriptEditors(refs: OpenScriptEditorRef[]): void {
        this.getModeler().get<OpenScriptEditorsStore>("openScriptEditorsStore", false)?.set(refs);
    }

    /**
     * Switches the colour theme live. Toggles `data-bpmn-theme` on this
     * instance's container + panel parent (the authoritative, per-instance
     * mechanism) and mirrors the choice to the legacy page-global `#theme-link`
     * when one is present. `"automatic"` follows the OS/browser
     * `prefers-color-scheme` live while `"light"`/`"dark"` force a fixed kind. A
     * host that themes off its own chrome maps that signal to a forced mode at
     * the adapter.
     */
    setTheme(theme: ThemeMode): void {
        this.core.setTheme(this.store, theme);
    }

    /**
     * Switches Design / Implement without re-importing or losing engine data.
     * Fires onModeChanged once per actual change.
     */
    setMode(mode: ModelerMode): void {
        applyMode(this.modePorts(), mode);
    }

    /**
     * The current design/implement mode, read off the panel filter (the single
     * source of truth).
     *
     * @throws {NoModelerError} If {@link init} has not been called.
     */
    getMode(): ModelerMode {
        return this.getModeler()
            .get<{ getMode(): ModelerMode }>("propertiesPanelModeFilter")
            .getMode();
    }

    private modePorts(): ModePorts {
        const modeler = this.getModeler();
        const filter = modeler.get<{
            getMode(): ModelerMode;
            setMode(mode: ModelerMode): void;
        }>("propertiesPanelModeFilter");
        return {
            getFilterMode: () => filter.getMode(),
            setFilterMode: (mode) => filter.setMode(mode),
            setModeAttribute: (mode) => this.setModeAttribute(mode),
            setLintMode: (mode) =>
                this.getModeler().get<LintConfigService>("bpmnLintConfig", false)?.setMode(mode),
            onModeChanged: this.options.onModeChanged,
        };
    }

    private setModeAttribute(mode: ModelerMode): void {
        this.container.setAttribute(MODE_ATTRIBUTE, mode);
        this.options.propertiesPanel.parent.setAttribute(MODE_ATTRIBUTE, mode);
    }

    /** @internal A missing code-link capability must tolerate host status pushes. */
    applyImplementationStatus(resolved: Record<string, boolean>): void {
        this.getModeler().get<CodeLinkMapClient>("codeLinkMapClient", false)?.applyStatus(resolved);
    }

    // Read the engine profile from imported definitions to match template engine filtering.
    // C7 may omit the service; an empty profile clears any previous engine version.
    private applyEnginesFromDefinitions(): void {
        const definitions = this.getModeler().getDefinitions();
        const engines = deriveEngines(
            definitions?.get("modeler:executionPlatform"),
            definitions?.get("modeler:executionPlatformVersion"),
        );
        this.getModeler()
            .get<ElementTemplatesEngineService>("elementTemplates", false)
            ?.setEngines(engines);
    }

    /**
     * @throws {NoModelerError} If {@link init} has not been called.
     */
    private getModeler(): Modeler {
        return this.core.instance;
    }
}
