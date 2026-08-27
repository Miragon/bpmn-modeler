import Modeler from "camunda-bpmn-js/lib/base/Modeler";
import BpmnModeler7 from "camunda-bpmn-js/lib/camunda-platform/Modeler";
import BpmnModeler8 from "camunda-bpmn-js/lib/camunda-cloud/Modeler";
import { ImportXMLError, ImportXMLResult, SaveXMLResult } from "bpmn-js/lib/BaseViewer";
import TokenSimulationModule from "bpmn-js-token-simulation";
import { ElementTemplateChooserModule } from "@miragon/bpmn-modeler-element-template-chooser";
import TransactionBoundariesModule from "camunda-transaction-boundaries";
import { CreateAppendElementTemplatesModule } from "bpmn-js-create-append-anything";
import { AppendMenuModule } from "@miragon/bpmn-modeler-append-menu";
import { type CodeLinkMapClient } from "@miragon/bpmn-modeler-code-link";
import { FlowNavigationModule } from "@miragon/bpmn-modeler-flow-navigation";
import { CreateAppendC7ElementTemplatesModule } from "@miragon/create-append-c7";
import {
    BpmnModelerSetting,
    Engine,
    NoModelerError,
    OpenScriptEditorRef,
    ScriptKind,
    ScriptTaskScript,
} from "@miragon/bpmn-modeler-types";
import {
    collectInlineScriptTasks,
    findListenerAt,
    OpenScriptEditorsStore,
    ScriptSourceWatcher,
} from "@miragon/bpmn-modeler-inline-scripting";
import { capabilityModules } from "./capabilityModules";
import { ViewportManager } from "./viewport";
import { SelectionManager } from "./selection";
import { RootElementManager } from "./rootElement";
import { deriveEngines } from "./engines";
import LintModule from "./bpmnlint";
import { installKeyboardFocus } from "./keyboardFocus";
import { installCanvasFocusIndicator } from "./canvasFocusIndicator";
import type { CreateModelerOptions } from "./createModeler";

const DEFAULT_SETTINGS: BpmnModelerSetting = {
    alignToOrigin: false,
    showTransactionBoundaries: true,
    colorTheme: "automatic",
};

// Align-to-origin plugin config; the container / panel parent are per-instance
// HTMLElements resolved from the constructor options in {@link BpmnModeler.create}.
const ALIGN_TO_ORIGIN_OPTIONS = {
    alignOnSave: false,
    offset: 150,
    tolerance: 50,
};

/**
 * Encapsulates one bpmn-js modeler instance and all operations on it.
 *
 * Per-instance by construction: it is bound to its own `container` and
 * `propertiesPanelParent` (see {@link CreateModelerOptions}), so several
 * modelers can coexist on a page — the future in-page diff view wants two. Use
 * {@link createModeler} as the factory. All methods throw {@link NoModelerError}
 * if called before {@link create}, and {@link destroy} tears the instance down.
 *
 * Viewport and selection concerns are delegated to {@link ViewportManager}
 * and {@link SelectionManager}, accessible via the corresponding getters
 * after {@link create} has been called.
 */
export class BpmnModeler {
    private modeler: Modeler | undefined = undefined;

    private settings: BpmnModelerSetting = { ...DEFAULT_SETTINGS };

    // Tracks the active engine so transaction-boundary calls are gated to C7 only.
    private engine: Engine | undefined = undefined;

    private _viewport: ViewportManager | undefined;

    private _selection: SelectionManager | undefined;

    private _rootElement: RootElementManager | undefined;

    // Optional host sink for non-fatal warnings (element-not-found, missing
    // inline script). Kept as an injected callback rather than a host import so
    // the modeler stays constructible in tests and the standalone dev browser.
    private onWarningSink?: (message: string) => void;

    // Teardown for the container-scoped focus features installed in create();
    // run on re-create (to avoid stacking) and on destroy().
    private focusDisposers: Array<() => void> = [];

    /**
     * @param container The canvas host element (bpmn-js `container`).
     * @param options Per-instance config — see {@link CreateModelerOptions}.
     */
    constructor(
        private readonly container: HTMLElement,
        private readonly options: CreateModelerOptions,
    ) {}

    /**
     * Access the viewport manager after {@link create}.
     *
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    get viewport(): ViewportManager {
        if (!this._viewport) {
            throw new NoModelerError();
        }
        return this._viewport;
    }

    /**
     * Access the selection manager after {@link create}.
     *
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    get selection(): SelectionManager {
        if (!this._selection) {
            throw new NoModelerError();
        }
        return this._selection;
    }

    /**
     * Access the root element manager after {@link create}.
     *
     * @internal Host-adapter surface (drill-down state restore); not part of the
     *   designed public handle (#1375).
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    get rootElement(): RootElementManager {
        if (!this._rootElement) {
            throw new NoModelerError();
        }
        return this._rootElement;
    }

    /**
     * Creates and mounts the bpmn-js modeler for the given execution engine.
     *
     * Engine selection is a second step (not a constructor arg) because the host
     * detects the engine only after the file arrives, while closures that need
     * the facade (flush responder, protocol capabilities) are wired before that.
     * The per-instance DI extras and capabilities come from the constructor
     * options. Re-`create()` disposes the prior instance's focus installs first.
     *
     * @internal Migration-only two-step construction. The designed public API
     *   takes the engine up front and returns a ready handle from an async
     *   `createModeler` (#1375); #1376 collapses this second step into it.
     *
     * @param engine Camunda engine version — `"c7"` for Camunda Platform 7,
     *   `"c8"` for Camunda Cloud 8.
     * @throws {UnsupportedEngineError} If the engine string is not recognised.
     */
    create(engine: Engine): void {
        this.disposeFocusFeatures();

        // The linting toggle is always registered (LintModule) but its host port
        // is optional; a no-op keeps LintConfigService's DI resolvable host-less.
        const lintingHostModule = {
            lintingHost: [
                "value",
                this.options.lintingHost ?? { setLintingEnabled: () => undefined },
            ],
        };
        // Per-instance panel host, so id-coupled DI services (scriptEditorButtons)
        // observe this modeler's own panel instead of the first `#js-properties-panel`.
        const propertiesPanelRootModule = {
            propertiesPanelRoot: ["value", this.options.propertiesPanelParent],
        };
        const commonModules = [
            TokenSimulationModule,
            LintModule,
            ElementTemplateChooserModule,
            AppendMenuModule,
            FlowNavigationModule,
            lintingHostModule,
            propertiesPanelRootModule,
        ];
        const capModules = capabilityModules(engine, this.options.capabilities);
        const extra = (this.options.extraModules as any[]) ?? [];

        const modelerOptions = {
            container: this.container,
            propertiesPanel: { parent: this.options.propertiesPanelParent },
            alignToOrigin: ALIGN_TO_ORIGIN_OPTIONS,
        };

        this.engine = engine;

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
                        ...extra,
                    ],
                });
                break;
            }
            case "c8": {
                this.modeler = new BpmnModeler8({
                    ...modelerOptions,
                    additionalModules: [...commonModules, ...capModules, ...extra],
                });
                break;
            }
            default: {
                throw new UnsupportedEngineError(engine);
            }
        }

        const accessor = <T>(name: string): T => this.getModeler().get<T>(name);
        this._viewport = new ViewportManager(accessor);
        this._selection = new SelectionManager(accessor);
        this._rootElement = new RootElementManager(accessor);

        this.installFocusFeatures();

        /**
         * Apply default favourites immediately after creation.
         */
        if (this.settings.favouriteBpmnElements) {
            const appendMenuOverride = this.getModeler().get<any>("appendMenuOverride", false);
            if (appendMenuOverride) {
                appendMenuOverride.setFavourites(this.settings.favouriteBpmnElements);
            }
        }
    }

    /**
     * Composes the container-scopable focus features onto the fresh modeler:
     * the "Escape → focus canvas" guard and the canvas focus reticle. Both are
     * scoped to this instance's canvas container and panel parent so several
     * modelers on one page never cross-fire. Disposers are recorded so a
     * re-`create()` or {@link destroy} tears them down.
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

        // Escape re-homes focus onto the canvas so keyboard-driven modelling
        // (A/N/arrows, owned by bpmn-js's canvas-scoped Keyboard service) works
        // even from the panel or a search field; a further Escape on the focused
        // canvas clears the selection. Roots scope the guard to this instance.
        this.focusDisposers.push(
            installKeyboardFocus({
                roots: [canvasContainer, this.options.propertiesPanelParent],
                handleGlobalEscape: this.options.handleGlobalEscape ?? false,
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

        // The reticle beside the "Open minimap" control lights up green while the
        // canvas holds keyboard focus with nothing selected. It subscribes to
        // diagram-js's deduplicated `canvas.focus.changed` rather than a
        // container-level focusin (which would false-positive on the lint chip).
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

    /**
     * Tears the instance down: disposes the focus features and destroys the
     * underlying bpmn-js modeler (which frees its event bus, DI graph, and DOM).
     * A destroyed facade throws {@link NoModelerError} from every accessor.
     */
    destroy(): void {
        this.disposeFocusFeatures();
        this.modeler?.destroy();
        this.modeler = undefined;
        this._viewport = undefined;
        this._selection = undefined;
        this._rootElement = undefined;
    }

    /**
     * Subscribes to the `elementTemplates.errors` event.
     *
     * @param cb Callback invoked with the array of template errors.
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    onElementTemplatesErrors(cb: (errors: any) => void): void {
        this.getModeler().on("elementTemplates.errors", (event: any) => {
            const { errors } = event;
            cb(errors);
        });
    }

    /**
     * Subscribes to the `commandStack.changed` event on the modeler's event bus.
     *
     * @internal Raw change hook. The designed API exposes the debounced
     *   `onContentSaved` event instead; this stays for the host adapter (#1375).
     * @param cb Callback invoked whenever the command stack changes.
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    onCommandStackChanged(cb: () => void): void {
        this.getModeler().get<any>("eventBus").on("commandStack.changed", cb);
    }

    /**
     * Returns the live moddle definitions tree (`bpmn:Definitions` root) so
     * callers can walk the in-memory model — e.g. to extract process variables
     * for script IntelliSense — without round-tripping through XML.
     *
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    getDefinitions(): any {
        return this.getModeler().getDefinitions();
    }

    /**
     * Returns every `bpmn:ScriptTask` in the diagram that carries an inline
     * script, for the host's "Generate Script Files for Script Tasks" command. The
     * scan and filtering rules live in {@link collectInlineScriptTasks} so the
     * bulk path and the single-open path stay in agreement.
     *
     * @internal Host-adapter surface (inline-scripting capability, #1375).
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    collectInlineScriptTasks(): ScriptTaskScript[] {
        return collectInlineScriptTasks(this.getModeler().get<any>("elementRegistry"));
    }

    /**
     * Creates a new, empty BPMN diagram in the modeler.
     *
     * @returns {@link ImportXMLResult} with any warnings produced during import.
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    async newDiagram(): Promise<ImportXMLResult> {
        const result = await this.getModeler().createDiagram();
        this.applyEnginesFromDefinitions();
        return result;
    }

    /**
     * Loads the given BPMN XML into the modeler, replacing any current diagram.
     *
     * @param bpmn Raw BPMN 2.0 XML string.
     * @returns {@link ImportXMLResult} with any warnings produced during import.
     * @throws {NoModelerError} If the modeler has not been created yet.
     * @throws {Error} If the XML cannot be parsed.
     */
    async loadDiagram(bpmn: string): Promise<ImportXMLResult> {
        try {
            return await this.getModeler()
                .importXML(bpmn)
                .then((result: ImportXMLResult) => {
                    /**
                     * Transaction boundaries are only available for the C7 modeler.
                     */
                    if (this.engine === "c7" && this.settings.showTransactionBoundaries) {
                        this.getModeler().get<any>("transactionBoundaries").show();
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

    /**
     * Serialises the current diagram to a BPMN 2.0 XML string.
     *
     * @returns Formatted XML string.
     * @throws {NoModelerError} If the modeler has not been created yet.
     * @throws {Error} If the diagram cannot be serialised.
     */
    async exportDiagram(): Promise<string> {
        const result: SaveXMLResult = await this.getModeler().saveXML({ format: true });
        if (result.xml) {
            return result.xml;
        } else if (result.error) {
            throw result.error;
        }
        throw new Error("Failed to save changes made to the diagram!");
    }

    /**
     * Exports the current diagram as an SVG string.
     *
     * @returns SVG markup string.
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    async getDiagramSvg(): Promise<string> {
        const result = await this.getModeler().saveSVG();
        return result.svg;
    }

    /**
     * Pushes a new set of element templates to the modeler's template loader.
     *
     * @param templates Array of element template objects, or `undefined` (no-op).
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    setElementTemplates(templates: JSON[] | undefined): void {
        if (!templates) {
            return;
        }
        this.getModeler().get<any>("elementTemplatesLoader").setTemplates(templates);
    }

    /**
     * Applies a partial settings update.
     *
     * @param settings Partial settings object to merge, or `undefined` (no-op).
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    setSettings(settings: Partial<BpmnModelerSetting> | undefined): void {
        if (!settings) {
            return;
        }
        // Ensure the modeler exists before applying any settings.
        this.getModeler();
        this.settings = { ...this.settings, ...settings };

        /**
         * Apply color theme mode change immediately. Page-level theme state
         * lives outside the facade (shared with the dmn-webview), so we call the
         * host-provided sink rather than the module singleton directly.
         */
        if (settings.colorTheme !== undefined) {
            this.options.applyColorThemeMode?.(this.settings.colorTheme);
        }

        /**
         * Apply transaction boundary visibility change immediately for C7.
         */
        if (this.engine === "c7") {
            const tb = this.getModeler().get<any>("transactionBoundaries");
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            this.settings.showTransactionBoundaries ? tb.show() : tb.hide();
        }

        /**
         * Apply favourite BPMN elements to the append menu.
         */
        if (settings.favouriteBpmnElements !== undefined) {
            const appendMenuOverride = this.getModeler().get<any>("appendMenuOverride", false);
            if (appendMenuOverride) {
                appendMenuOverride.setFavourites(settings.favouriteBpmnElements);
            }
        }
    }

    /**
     * Triggers the align-to-origin plugin if the setting is enabled.
     *
     * @internal Host-adapter surface (invoked on save by the VS Code editor
     *   controller); folded behind the `alignToOrigin` setting in the designed
     *   API (#1375).
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    alignElementsToOrigin(): void {
        if (this.settings.alignToOrigin) {
            this.getModeler().get<any>("alignToOrigin").align();
        }
    }

    /**
     * Returns a service from the modeler's dependency injection container.
     *
     * @remarks Unstable escape hatch — kept public deliberately (see the
     *   ADR 0007, `docs/adr`) so advanced integrations are not blocked, but
     *   not covered by semver: DI service names can change across minor
     *   versions. Prefer a typed option/method where one exists.
     * @param name The DI service name (e.g. `"customTranslator"`).
     * @returns The service instance.
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    getService<T = any>(name: string): T {
        return this.getModeler().get<T>(name);
    }

    /**
     * Persists a chosen script format back to the BPMN model via the
     * bpmn-js command stack. Used after the host's Quick-Pick fallback
     * resolves an unsupported / empty `camunda:scriptFormat` so the next
     * open of the same script skips the prompt.
     *
     * - `script-task`: writes to the element's `scriptFormat`.
     * - `execution-listener` / `task-listener`: writes to the listener's
     *   nested `camunda:Script.scriptFormat`.
     *
     * @internal Host-adapter surface (inline-scripting capability, #1375).
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    updateScriptFormat(
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        scriptFormat: string,
    ): void {
        const modeler = this.getModeler();
        const elementRegistry = modeler.get<any>("elementRegistry");
        const modeling = modeler.get<any>("modeling");
        const element = elementRegistry.get(elementId);
        if (!element) {
            this.warn(`Element not found: ${elementId}`);
            return;
        }

        if (kind === "script-task") {
            // `scriptFormat` is a plain BPMN attribute on the script task, not a
            // Camunda-namespaced one — it is the exact property the panel's
            // "Format" field reads/writes, so a `camunda:` prefix would persist
            // an attribute the field never displays (leaving it blank).
            modeling.updateModdleProperties(element, element.businessObject, {
                scriptFormat,
            });
            return;
        }

        const listenerType =
            kind === "execution-listener" ? "camunda:ExecutionListener" : "camunda:TaskListener";
        const listener = findListenerAt(element.businessObject, listenerType, listenerIndex);
        if (!listener || !listener.script) {
            this.warn(`${listenerType} #${listenerIndex} on ${elementId} has no inline script`);
            return;
        }
        modeling.updateModdleProperties(element, listener.script, {
            scriptFormat,
        });
    }

    /**
     * Persists updated script content to the appropriate moddle property
     * via the bpmn-js command stack so the change is undoable and serialised
     * back to the BPMN XML.
     *
     * - `script-task`: writes to the element's `script` string property.
     * - `execution-listener` / `task-listener`: locates the listener at
     *   `listenerIndex` within the parent's filtered list of that listener
     *   type, then writes to its nested `camunda:Script` element's `value`.
     *
     * @internal Host-adapter surface (inline-scripting capability, #1375).
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    updateScriptContent(
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        content: string,
    ): void {
        const modeler = this.getModeler();
        const elementRegistry = modeler.get<any>("elementRegistry");
        const modeling = modeler.get<any>("modeling");
        const element = elementRegistry.get(elementId);
        if (!element) {
            this.warn(`Element not found: ${elementId}`);
            return;
        }

        // Pre-declare this write as tab-originated *before* the moddle write:
        // `commandStack.changed` fires synchronously inside it, and the watcher
        // must see the new content as its baseline or it would report our own
        // keystroke back to the host as a model-side change.
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
            this.warn(`${listenerType} #${listenerIndex} on ${elementId} has no inline script`);
            return;
        }
        modeling.updateModdleProperties(element, listener.script, {
            value: content,
        });
    }

    /**
     * Hands the host's current set of open inline-script editors to the
     * {@link OpenScriptEditorsStore}, which locks the matching properties-panel
     * script fields (single-writer arbitration). C7-only: the store/provider
     * modules are not registered for C8, so the service is resolved defensively
     * and the call is a no-op there.
     *
     * @internal Host-adapter surface (inline-scripting capability, #1375).
     */
    applyOpenScriptEditors(refs: OpenScriptEditorRef[]): void {
        this.getModeler().get<OpenScriptEditorsStore>("openScriptEditorsStore", false)?.set(refs);
    }

    /**
     * Registers a sink for non-fatal warnings so the host can forward them to the
     * output channel. Without it these only reached the webview console, invisible
     * in a bug report.
     */
    onWarning(sink: (message: string) => void): void {
        this.onWarningSink = sink;
    }

    /**
     * Hands the host's per-activity implementation-resolution map to the
     * code-link DI service, which caches it and refreshes the context pad so the
     * "Go to implementation" entry hides for tasks whose implementation does not
     * exist in the workspace.
     *
     * The service is resolved defensively (`get(..., false)`): a consumer that
     * omits the codeLink capability registers no `codeLinkMapClient`, and a
     * stray status push must then be a no-op rather than throw.
     *
     * @internal Host-adapter surface (code-link capability, #1375).
     * @throws {NoModelerError} If the modeler has not been created yet.
     */
    applyImplementationStatus(resolved: Record<string, boolean>): void {
        this.getModeler().get<CodeLinkMapClient>("codeLinkMapClient", false)?.applyStatus(resolved);
    }

    /**
     * Emits a non-fatal warning to the console (preserved for dev/tests) and, if
     * a host sink is wired via {@link onWarning}, forwards it to the channel.
     */
    private warn(message: string): void {
        console.warn(message);
        this.onWarningSink?.(message);
    }

    /**
     * Re-derives the element-template engine profile from the freshly imported
     * definitions and pushes it to the `elementTemplates` service, which
     * re-indexes and fires `elementTemplates.changed` so the chooser/panel
     * refresh live. Called after every import (open, migration rewrite, new
     * diagram) since those replace the definitions the version rides on.
     *
     * Engines come from the diagram, not a setting, to match Camunda Modeler
     * and the library's own lint rule; templates without `engines` stay visible
     * by library semantics. The service is fetched defensively — the C7 base
     * modeler may not register it, and `{}` clears any prior value.
     */
    private applyEnginesFromDefinitions(): void {
        const definitions = this.getModeler().getDefinitions();
        const engines = deriveEngines(
            definitions?.get("modeler:executionPlatform"),
            definitions?.get("modeler:executionPlatformVersion"),
        );
        this.getModeler().get<any>("elementTemplates", false)?.setEngines(engines);
    }

    /**
     * @throws {NoModelerError} If {@link create} has not been called.
     */
    private getModeler(): Modeler {
        if (!this.modeler) {
            throw new NoModelerError();
        }
        return this.modeler;
    }
}

/**
 * Thrown by {@link BpmnModeler.create} when an unknown engine string is passed.
 */
export class UnsupportedEngineError extends Error {
    /**
     * @param engine The unrecognised engine string.
     */
    constructor(engine: string) {
        super(`Unsupported engine: ${engine}`);
    }
}
