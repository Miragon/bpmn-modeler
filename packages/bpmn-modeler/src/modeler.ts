import Modeler from "camunda-bpmn-js/lib/base/Modeler";
import BpmnModeler7 from "camunda-bpmn-js/lib/camunda-platform/Modeler";
import BpmnModeler8 from "camunda-bpmn-js/lib/camunda-cloud/Modeler";
import { ImportXMLError, ImportXMLResult, SaveXMLResult } from "bpmn-js/lib/BaseViewer";
import type { ModuleDeclaration } from "didi";
import TokenSimulationModule from "bpmn-js-token-simulation";
import { ElementTemplateChooserModule } from "@miragon/bpmn-modeler-element-template-chooser";
// The CJS entry wraps the ESM module in a default export, preventing DI registration under Vite.
import TransactionBoundariesModule from "camunda-transaction-boundaries/lib/index.js";
import { CreateAppendElementTemplatesModule } from "bpmn-js-create-append-anything";
import { AppendMenuModule } from "@miragon/bpmn-modeler-append-menu";
import type { CodeLinkMapClient } from "@miragon/bpmn-modeler-code-link";
import { FlowNavigationModule } from "@miragon/bpmn-modeler-flow-navigation";
import { createBpmnLayoutModule } from "@miragon/bpmn-modeler-layout";
import type { CleanupService, LayoutOutcome, Layouter } from "@miragon/bpmn-modeler-layout";
import type { CleanupOutcome } from "@miragon/bpmn-modeler-types";
import { CreateAppendC7ElementTemplatesModule } from "@miragon/create-append-c7";
import { createClipboardModules } from "@miragon/bpmn-modeler-clipboard";
// The full panel conflicts with Camunda's propertiesPanel service. Deep imports also avoid
// its TSX renderer, whose JSX runtime does not resolve in Vite development builds.
import { ModeFilterModule } from "@miragon/bpmn-modeler-properties-panel/modeFilter/ModeFilterProvider";
import { CustomGroupsModule } from "@miragon/bpmn-modeler-properties-panel/customGroups/CustomGroupsRegistry";
import { TranslateModule } from "@miragon/bpmn-modeler-i18n";
import { installContentEditableClipboardPolyfill } from "./propertiesPanelClipboard";
import { ThemeController } from "./theme";
import {
    BpmnlintConfig,
    BpmnModelerSetting,
    DisposableStore,
    Engine,
    getLatestVersion,
    LintResults,
    NoModelerError,
    OpenScriptEditorRef,
    ScriptKind,
    ScriptTaskScript,
    subscribe,
} from "@miragon/bpmn-modeler-types";
import {
    collectInlineScriptTasks,
    findListenerAt,
    OpenScriptEditorsStore,
    ScriptSourceWatcher,
} from "@miragon/bpmn-modeler-inline-scripting";
import type { ScriptTaskBusinessObject } from "@miragon/bpmn-modeler-inline-scripting";
import { buildLintModules } from "./lintModules";
import { createLintHandleMethods, type LintHandleMethods } from "./lintHandle";
import { capabilityModules } from "./capabilityModules";
import { wireContentSaved } from "./contentSaved";
import { createReporter, type SurfaceReporter } from "./reporting";
import { installSurfaceFocusFeatures } from "./focusFeatures";
import { CanvasViewportManager, type ViewportManager } from "./viewport";
import { ElementSelectionManager, type SelectionManager } from "./selection";
import { CanvasRootElementManager, type RootElementManager } from "./rootElement";
import {
    applyViewState as applyViewStateComposition,
    captureViewState as captureViewStateComposition,
    type ViewState,
} from "./viewState";
import { deriveEngines } from "./engines";
import { initialDiagram } from "./initialDiagram";
import { applyMode, normalizeMode, MODE_ATTRIBUTE, type ModePorts, type ModelerMode } from "./mode";
import { ModeUiModule } from "./modeModules";
import type { CreateModelerOptions } from "./createModeler";
import type { CoreModelerServices, ThemeMode } from "./publicApi";
import type { LintConfigService } from "./bpmnlint/LintConfigService";

// Structural slivers of non-core bpmn-js DI services — only the members this
// facade calls, so the untyped `.get<any>` reaches are gone without adopting a
// full didi service map (see docs/adr/engineering-practices.md#private-upstream-apis).
interface AppendMenuOverrideService {
    setFavourites(types: string[]): void;
}
interface TransactionBoundariesService {
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
    private modeler: Modeler | undefined = undefined;

    private settings: BpmnModelerSetting = { ...DEFAULT_SETTINGS };

    private engine: Engine | undefined = undefined;

    private _viewport: ViewportManager | undefined;

    private _selection: SelectionManager | undefined;

    private _rootElement: RootElementManager | undefined;

    private readonly reporter: SurfaceReporter;

    private themeController?: ThemeController;

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
        this.reporter = createReporter({ onWarning: options.onWarning, onError: options.onError });
    }

    /**
     * Access the viewport manager after {@link init}.
     */
    get viewport(): ViewportManager {
        if (!this._viewport) {
            throw new NoModelerError();
        }
        return this._viewport;
    }

    /**
     * Access the selection manager after {@link init}.
     */
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
        return captureViewStateComposition({
            viewport: this.viewport,
            rootElement: this.rootElement,
            selection: this.selection,
        });
    }

    /**
     * Re-applies a {@link captureViewState} snapshot, restoring plane, viewbox,
     * and selection in the required root → viewport → selection order.
     */
    applyViewState(state: ViewState): void {
        applyViewStateComposition(
            {
                viewport: this.viewport,
                rootElement: this.rootElement,
                selection: this.selection,
            },
            state,
        );
    }

    /**
     * @internal Async signature retained for compatibility.
     * @throws {UnsupportedEngineError} If the engine string is not recognised.
     */
    async init(): Promise<void> {
        const engine = this.options.engine;
        this.store.dispose();
        this.store = new DisposableStore();

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
            FlowNavigationModule,
            createBpmnLayoutModule(),
            propertiesPanelRootModule,
            ModeFilterModule,
            CustomGroupsModule,
            ModeUiModule,
        ];
        const capModules = capabilityModules(engine, this.options.capabilities);
        const clip = this.options.clipboard;
        const clipModules = clip
            ? createClipboardModules({ element: clip.bridge, text: clip.text })
            : [];
        if (clip) {
            // FEEL editors sit outside bpmn-js DI and need the document-level text bridge.
            // Wrap callbacks to preserve the bridge's this binding.
            const textBridge = clip.text ?? clip.bridge;
            this.store.add(
                installContentEditableClipboardPolyfill(
                    [this.container, this.options.propertiesPanel.parent],
                    {
                        requestClipboard: () => textBridge.requestClipboard(),
                        writeClipboard: (text) => {
                            void textBridge.writeClipboard(text);
                        },
                    },
                ),
            );
        }
        const extra = (this.options.additionalModules as ModuleDeclaration[]) ?? [];

        const modelerOptions = {
            container: this.container,
            propertiesPanel: {
                parent: this.options.propertiesPanel.parent,
                // Keep popups within this instance's theme scope instead of document.body.
                feelPopupContainer: this.container,
            },
            alignToOrigin: ALIGN_TO_ORIGIN_OPTIONS,
            moddleExtensions: this.options.moddleExtensions,
            // The panel defaults to design if this config is absent.
            propertiesPanelMode: normalizeMode(this.options.mode),
        };

        this.engine = engine;

        this.allocateModeler(engine, modelerOptions, commonModules, capModules, clipModules, extra);
        this.store.add(() => {
            this.modeler?.destroy();
            this.modeler = undefined;
        });

        const accessor = <T>(name: string): T => this.getModeler().get<T>(name);
        this._viewport = new CanvasViewportManager(accessor);
        this._selection = new ElementSelectionManager(accessor);
        this._rootElement = new CanvasRootElementManager(accessor);

        this.store.add(
            installSurfaceFocusFeatures(accessor, {
                extraRoots: [this.options.propertiesPanel.parent],
                handleGlobalEscape: this.options.handleGlobalEscape ?? false,
                hasSearchPad: true,
            }),
        );

        if (this.settings.favouriteBpmnElements) {
            const appendMenuOverride = this.getModeler().get<AppendMenuOverrideService>(
                "appendMenuOverride",
                false,
            );
            if (appendMenuOverride) {
                appendMenuOverride.setFavourites(this.settings.favouriteBpmnElements);
            }
        }

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
                eventBus: this.getModeler().get("eventBus"),
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

    private allocateModeler(
        engine: Engine,
        modelerOptions: object,
        commonModules: unknown[],
        capModules: unknown[],
        clipModules: unknown[],
        extra: unknown[],
    ): void {
        try {
            switch (engine) {
                case "c7": {
                    this.modeler = new BpmnModeler7({
                        ...modelerOptions,
                        additionalModules: [
                            ...commonModules,
                            CreateAppendElementTemplatesModule,
                            CreateAppendC7ElementTemplatesModule,
                            TransactionBoundariesModule,
                            ...capModules,
                            ...clipModules,
                            ...extra,
                        ],
                    });
                    break;
                }
                case "c8": {
                    this.modeler = new BpmnModeler8({
                        ...modelerOptions,
                        additionalModules: [
                            ...commonModules,
                            ...capModules,
                            ...clipModules,
                            ...extra,
                        ] as ModuleDeclaration[],
                    });
                    break;
                }
                default: {
                    throw new UnsupportedEngineError(engine);
                }
            }
        } catch (error) {
            // A partially-constructed bpmn-js attaches `.bjs-container` with no
            // handle to destroy; clear the dedicated container before rethrowing.
            this.container.replaceChildren();
            throw error;
        }
    }

    /**
     * Feeds host-computed lint results to the in-canvas overlays (external tier).
     * Any push switches an in-page instance to the external tier. `null`
     * deactivates linting (no `.bpmnlintrc` / read failure). A no-op with a warning
     * when the instance was created without a lint module (no lint service).
     */
    applyLintResults(results: LintResults | null): void {
        this.lintHandle().applyLintResults(results);
    }

    /**
     * Renders the host's user-disabled lint state (external tier): clears overlays
     * and shows the re-enable chip. A no-op with a warning when the instance was
     * created without a lint module.
     */
    applyLintingDisabled(): void {
        this.lintHandle().applyLintingDisabled();
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
        this.lintHandle().startInPageLinting(config, configToken);
    }

    private lintHandle(): LintHandleMethods {
        return createLintHandleMethods(
            () => this.getModeler().get<LintConfigService>("bpmnLintConfig", false) ?? undefined,
            (message) => console.warn(message),
        );
    }

    /**
     * Tears the instance down: disposes every registered lifecycle resource (the
     * debounced export, focus features, event subscriptions, mode attributes,
     * theme controller, clipboard polyfill, and the underlying bpmn-js modeler)
     * in reverse order. Idempotent. A destroyed facade throws
     * {@link NoModelerError} from every accessor.
     */
    destroy(): void {
        this.store.dispose();
        this._viewport = undefined;
        this._selection = undefined;
        this._rootElement = undefined;
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
        this.applyEnginesFromDefinitions();
        return result;
    }

    async loadDiagram(bpmn: string): Promise<ImportXMLResult> {
        try {
            return await this.getModeler()
                .importXML(bpmn)
                .then((result: ImportXMLResult) => {
                    // Transaction boundaries are a C7-only feature.
                    if (this.engine === "c7" && this.settings.showTransactionBoundaries) {
                        this.getModeler()
                            .get<TransactionBoundariesService>("transactionBoundaries")
                            .show();
                    }
                    this.applyEnginesFromDefinitions();
                    return result;
                });
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
        throw new Error("Failed to save changes made to the diagram!");
    }

    async getDiagramSvg(): Promise<string> {
        const result = await this.getModeler().saveSVG();
        return result.svg;
    }

    /**
     * Rearranges the diagram left to right, applied as one undoable step.
     *
     * @see BpmnModelerHandle.formatDiagram
     */
    async formatDiagram(): Promise<LayoutOutcome> {
        return this.getModeler().get<Layouter>("bpmnLayouter").format();
    }

    /**
     * Reports or removes diagram garbage.
     *
     * @see BpmnModelerHandle.cleanupDiagram
     */
    cleanupDiagram(options?: { apply?: boolean }): CleanupOutcome {
        const cleanup = this.getModeler().get<CleanupService>("bpmnCleanup");
        return options?.apply ? cleanup.apply() : cleanup.inspect();
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

        if (this.engine === "c7") {
            const tb = this.getModeler().get<TransactionBoundariesService>("transactionBoundaries");
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            this.settings.showTransactionBoundaries ? tb.show() : tb.hide();
        }

        if (settings.favouriteBpmnElements !== undefined) {
            const appendMenuOverride = this.getModeler().get<AppendMenuOverrideService>(
                "appendMenuOverride",
                false,
            );
            if (appendMenuOverride) {
                appendMenuOverride.setFavourites(settings.favouriteBpmnElements);
            }
        }
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
        return this.getModeler().get<T>(name);
    }

    /** @internal */
    updateScriptFormat(
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        scriptFormat: string,
    ): void {
        const modeler = this.getModeler();
        const elementRegistry = modeler.get<ScriptModelElementRegistry>("elementRegistry");
        const modeling = modeler.get<ScriptModeling>("modeling");
        const element = elementRegistry.get(elementId);
        if (!element) {
            this.reporter.warn(`Element not found: ${elementId}`);
            return;
        }

        if (kind === "script-task") {
            // Script-task scriptFormat is unnamespaced; camunda:scriptFormat would be ignored by the panel.
            modeling.updateModdleProperties(element, element.businessObject, {
                scriptFormat,
            });
            return;
        }

        const listenerType =
            kind === "execution-listener" ? "camunda:ExecutionListener" : "camunda:TaskListener";
        const listener = findListenerAt(element.businessObject, listenerType, listenerIndex);
        if (!listener || !listener.script) {
            this.reporter.warn(
                `${listenerType} #${listenerIndex} on ${elementId} has no inline script`,
            );
            return;
        }
        modeling.updateModdleProperties(element, listener.script, {
            scriptFormat,
        });
    }

    /** @internal */
    updateScriptContent(
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        content: string,
    ): void {
        const modeler = this.getModeler();
        const elementRegistry = modeler.get<ScriptModelElementRegistry>("elementRegistry");
        const modeling = modeler.get<ScriptModeling>("modeling");
        const element = elementRegistry.get(elementId);
        if (!element) {
            this.reporter.warn(`Element not found: ${elementId}`);
            return;
        }

        // commandStack.changed fires during the write; set the baseline first to avoid echoing our own edit.
        modeler
            .get<ScriptSourceWatcher>("scriptSourceWatcher", false)
            ?.noteApplied(elementId, kind, listenerIndex, content);

        if (kind === "script-task") {
            modeling.updateModdleProperties(element, element.businessObject, {
                script: content,
            });
            return;
        }

        const listenerType =
            kind === "execution-listener" ? "camunda:ExecutionListener" : "camunda:TaskListener";
        const listener = findListenerAt(element.businessObject, listenerType, listenerIndex);
        if (!listener || !listener.script) {
            this.reporter.warn(
                `${listenerType} #${listenerIndex} on ${elementId} has no inline script`,
            );
            return;
        }
        modeling.updateModdleProperties(element, listener.script, {
            value: content,
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
        if (!this.themeController) {
            this.themeController = new ThemeController([
                this.container,
                this.options.propertiesPanel.parent,
            ]);
            this.store.add(() => this.themeController?.dispose());
        }
        this.themeController.setMode(theme);
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
        if (!this.modeler) {
            throw new NoModelerError();
        }
        return this.modeler;
    }
}

/**
 * Thrown by {@link BpmnModeler.init} when an unknown engine string is passed.
 */
export class UnsupportedEngineError extends Error {
    /**
     * @param engine The unrecognised engine string.
     */
    constructor(engine: string) {
        super(`Unsupported engine: ${engine}`);
    }
}
