import Modeler from "camunda-bpmn-js/lib/base/Modeler";
import BpmnModeler7 from "camunda-bpmn-js/lib/camunda-platform/Modeler";
import BpmnModeler8 from "camunda-bpmn-js/lib/camunda-cloud/Modeler";
import { ImportXMLError, ImportXMLResult, SaveXMLResult } from "bpmn-js/lib/BaseViewer";
import TokenSimulationModule from "bpmn-js-token-simulation";
import { ElementTemplateChooserModule } from "@miragon/bpmn-modeler-element-template-chooser";
// Deep ESM import: the package's CJS entry (`index.js` requiring an ESM `lib/`)
// yields `{ default: <module> }` under Vite 8's require-of-ESM interop, so the
// DI module never registers and every `get("transactionBoundaries")` throws.
import TransactionBoundariesModule from "camunda-transaction-boundaries/lib/index.js";
import { CreateAppendElementTemplatesModule } from "bpmn-js-create-append-anything";
import { AppendMenuModule } from "@miragon/bpmn-modeler-append-menu";
import type { CodeLinkMapClient } from "@miragon/bpmn-modeler-code-link";
import { FlowNavigationModule } from "@miragon/bpmn-modeler-flow-navigation";
import { CreateAppendC7ElementTemplatesModule } from "@miragon/create-append-c7";
import { createClipboardModules } from "@miragon/bpmn-modeler-clipboard";
import { TranslateModule } from "@miragon/bpmn-modeler-i18n";
import { installContentEditableClipboardPolyfill } from "./propertiesPanelClipboard";
import { setThemeMode } from "./theme";
import {
    asyncDebounce,
    type AsyncDebounced,
    BpmnlintConfig,
    BpmnModelerSetting,
    Engine,
    LintResults,
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
import { installKeyboardFocus } from "./keyboardFocus";
import { installCanvasFocusIndicator } from "./canvasFocusIndicator";
import { DrilldownFit, DrilldownFitModule } from "./drilldownFit";
import type { CreateModelerOptions } from "./createModeler";
import type { CoreModelerServices, ThemeMode } from "./publicApi";
// Type-only: erased at build so it never pulls the lazy lint chunk into the main bundle.
import type { LintConfigService } from "./bpmnlint/LintConfigService";

const DEFAULT_SETTINGS: BpmnModelerSetting = {
    alignToOrigin: false,
    showTransactionBoundaries: true,
    colorTheme: "automatic",
    fitOnDrilldown: false,
};

// Align-to-origin plugin config; the container / panel parent are per-instance
// HTMLElements resolved from the constructor options in {@link BpmnModeler.init}.
const ALIGN_TO_ORIGIN_OPTIONS = {
    alignOnSave: false,
    offset: 150,
    tolerance: 50,
};

/**
 * Encapsulates one bpmn-js modeler instance and all operations on it.
 *
 * Per-instance by construction: it is bound to its own `container` and
 * `propertiesPanel.parent` (see {@link CreateModelerOptions}), so several
 * modelers can coexist on a page. Use {@link createModeler} as the factory. All
 * methods throw {@link NoModelerError} if called before {@link init}, and
 * {@link destroy} tears the instance down.
 *
 * Viewport and selection concerns are delegated to {@link ViewportManager}
 * and {@link SelectionManager}, accessible via the corresponding getters
 * after {@link init} has been called.
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

    // Teardown for the container-scoped focus features installed in init();
    // run on re-create (to avoid stacking) and on destroy().
    private focusDisposers: Array<() => void> = [];

    // The debounced content-saved emitter, live only when `onContentSaved` was
    // supplied. Held so {@link destroy} can cancel a pending trailing export.
    private contentSaved?: AsyncDebounced<() => Promise<void>>;

    /**
     * @param container The canvas host element (bpmn-js `container`).
     * @param options Per-instance config — see {@link CreateModelerOptions}.
     */
    constructor(
        private readonly container: HTMLElement,
        private readonly options: CreateModelerOptions,
    ) {
        this.onWarningSink = options.onWarning;
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

    /**
     * Access the root element manager after {@link init}.
     *
     * @internal Host-adapter surface (drill-down state restore); not part of the
     *   public handle.
     */
    get rootElement(): RootElementManager {
        if (!this._rootElement) {
            throw new NoModelerError();
        }
        return this._rootElement;
    }

    /**
     * Creates and mounts the bpmn-js modeler for the engine in `options.engine`,
     * then wires the per-instance subscriptions (element-template errors,
     * debounced content-saved). The DI extras, capabilities, and page-level
     * side-effect callbacks all come from the constructor options.
     *
     * Async because the engine-aware step awaits the lazy bpmnlint chunk before
     * constructing bpmn-js. Re-`init()` disposes the prior instance's focus
     * installs first.
     *
     * @internal Construction step invoked by {@link createModeler}; not part of
     *   the public handle.
     * @throws {UnsupportedEngineError} If the engine string is not recognised.
     */
    async init(): Promise<void> {
        const engine = this.options.engine;
        this.disposeFocusFeatures();

        // Per-instance panel host, so id-coupled DI services (scriptEditorButtons)
        // observe this modeler's own panel instead of the first `#js-properties-panel`.
        const propertiesPanelRootModule = {
            propertiesPanelRoot: ["value", this.options.propertiesPanel.parent],
        };
        // TranslateModule is an opinionated built-in registered on every instance
        // (the host-set locale is page-global), so the demo modeler gains
        // translations too — intended.
        const commonModules = [
            TranslateModule,
            TokenSimulationModule,
            ...(await this.buildLintModules(engine)),
            ElementTemplateChooserModule,
            AppendMenuModule,
            FlowNavigationModule,
            DrilldownFitModule,
            propertiesPanelRootModule,
        ];
        const capModules = capabilityModules(engine, this.options.capabilities);
        // Clipboard is a [B] built-in: omitting `clipboard` registers nothing, so
        // bpmn-js's native (browser) clipboard stays in charge; a host that
        // can't reach the system clipboard from its webview supplies a bridge.
        // A distinct `text` bridge routes label + contenteditable/FEEL surfaces
        // through the host's text channel; it defaults to the element bridge.
        const clip = this.options.clipboard;
        const clipModules = clip
            ? createClipboardModules({ element: clip.bridge, text: clip.text })
            : [];
        if (clip) {
            // The FEEL editor (CodeMirror 6) and diagram-js label overlay live
            // outside the bpmn-js DI context, so the DI clipboard modules above
            // don't reach them; this document-level polyfill bridges their
            // Cmd/Ctrl+C/V (and guards Ctrl+A) through the text bridge. Arrow-
            // wrapped so the bridge keeps its own `this`. Idempotent by its own
            // install guard, so a re-init() never stacks handlers.
            const textBridge = clip.text ?? clip.bridge;
            installContentEditableClipboardPolyfill(
                () => textBridge.requestClipboard(),
                (text) => textBridge.writeClipboard(text),
            );
        }
        const extra = (this.options.additionalModules as any[]) ?? [];

        const modelerOptions = {
            container: this.container,
            propertiesPanel: { parent: this.options.propertiesPanel.parent },
            alignToOrigin: ALIGN_TO_ORIGIN_OPTIONS,
            moddleExtensions: this.options.moddleExtensions,
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
                        ...clipModules,
                        ...extra,
                    ],
                });
                break;
            }
            case "c8": {
                this.modeler = new BpmnModeler8({
                    ...modelerOptions,
                    additionalModules: [...commonModules, ...capModules, ...clipModules, ...extra],
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
        this.applyFitOnDrilldown();

        if (this.settings.favouriteBpmnElements) {
            const appendMenuOverride = this.getModeler().get<any>("appendMenuOverride", false);
            if (appendMenuOverride) {
                appendMenuOverride.setFavourites(this.settings.favouriteBpmnElements);
            }
        }

        // Subscribe *before* the factory pushes the initial templates so the
        // errors fired while the loader validates them are observed.
        const onElementTemplatesErrors = this.options.onElementTemplatesErrors;
        if (onElementTemplatesErrors) {
            this.getModeler().on("elementTemplates.errors", (event: any) => {
                onElementTemplatesErrors(event.errors ?? []);
            });
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
            this.onCommandStackChanged(() => void this.contentSaved!());
        }
    }

    /**
     * Resolves the bpmnlint DI module(s) for the chosen tier, importing the lint
     * chunk only when linting is not disabled. `linting: false` returns no
     * modules — the chunk, and the whole bpmnlint/rules stack, is never fetched.
     * Every other value dynamically imports {@link createLintModule} and
     * registers one instance-scoped module carrying the tier, engine, explicit
     * config, and the facade callbacks.
     */
    private async buildLintModules(engine: Engine): Promise<unknown[]> {
        const linting = this.options.linting;
        if (linting === false) {
            return [];
        }
        // `undefined` and `{ config }` are in-page; only `{ results: "external" }`
        // opts out. Narrowing on `results` keeps `config` off the external variant.
        let tier: "external" | "in-page" = "in-page";
        let config;
        if (typeof linting === "object") {
            if (linting.results === "external") {
                tier = "external";
            } else {
                config = linting.config;
            }
        }
        const { createLintModule } = await import("./bpmnlint");
        return [
            createLintModule(
                { tier, engine, config },
                {
                    onLintResults: this.options.onLintResults,
                    onLintingToggled: this.options.onLintingToggled,
                },
            ),
        ];
    }

    /**
     * Feeds host-computed lint results to the in-canvas overlays (external tier).
     * Any push switches an in-page instance to the external tier. `null`
     * deactivates linting (no `.bpmnlintrc` / read failure). A no-op with a warning
     * when the instance was created with `linting: false` (no lint service).
     */
    applyLintResults(results: LintResults | null): void {
        const service = this.getModeler().get<LintConfigService>("bpmnLintConfig", false);
        if (!service) {
            console.warn("applyLintResults ignored: this modeler was created with linting: false");
            return;
        }
        service.applyLintResults(results);
    }

    /**
     * Renders the host's user-disabled lint state (external tier): clears overlays
     * and shows the re-enable chip. A no-op with a warning when `linting: false`.
     */
    applyLintingDisabled(): void {
        const service = this.getModeler().get<LintConfigService>("bpmnLintConfig", false);
        if (!service) {
            console.warn(
                "applyLintingDisabled ignored: this modeler was created with linting: false",
            );
            return;
        }
        service.applyLintingDisabled();
    }

    /**
     * Starts (or restarts) the in-page linter on host instruction — the handback
     * when the host finds no workspace `.bpmnlintrc`. Mirrors
     * {@link applyLintResults}: a no-op with a warning when the instance was
     * created with `linting: false` (no lint service). Never re-enables a
     * user-disabled linter (the service guards that); any later host push still
     * wins over the in-page run.
     */
    startInPageLinting(config?: BpmnlintConfig, configToken?: string): void {
        const service = this.getModeler().get<LintConfigService>("bpmnLintConfig", false);
        if (!service) {
            console.warn(
                "startInPageLinting ignored: this modeler was created with linting: false",
            );
            return;
        }
        service.startInPageLinting(config, configToken);
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
                roots: [canvasContainer, this.options.propertiesPanel.parent],
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
        this.contentSaved?.cancel();
        this.disposeFocusFeatures();
        this.modeler?.destroy();
        this.modeler = undefined;
        this._viewport = undefined;
        this._selection = undefined;
        this._rootElement = undefined;
    }

    /**
     * Subscribes to the `commandStack.changed` event on the modeler's event bus.
     *
     * @internal Raw change hook. The designed API exposes the debounced
     *   `onContentSaved` event instead; this stays for the host adapter.
     * @param cb Callback invoked whenever the command stack changes.
     */
    onCommandStackChanged(cb: () => void): void {
        this.getModeler().get<any>("eventBus").on("commandStack.changed", cb);
    }

    /**
     * Returns the live moddle definitions tree (`bpmn:Definitions` root) so
     * callers can walk the in-memory model — e.g. to extract process variables
     * for script IntelliSense — without round-tripping through XML.
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
     * @internal Host-adapter surface (inline-scripting capability).
     */
    collectInlineScriptTasks(): ScriptTaskScript[] {
        return collectInlineScriptTasks(this.getModeler().get<any>("elementRegistry"));
    }

    async newDiagram(): Promise<ImportXMLResult> {
        const result = await this.getModeler().createDiagram();
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

    setElementTemplates(templates: object[]): void {
        this.getModeler().get<any>("elementTemplatesLoader").setTemplates(templates);
    }

    setSettings(settings: Partial<BpmnModelerSetting> | undefined): void {
        if (!settings) {
            return;
        }
        this.getModeler();
        this.settings = { ...this.settings, ...settings };

        // `colorTheme` is deliberately not applied here: the page theme is host
        // policy driven through `theme` / {@link setTheme}. It stays in the
        // settings type/defaults but is inert on this path.

        if (this.engine === "c7") {
            const tb = this.getModeler().get<any>("transactionBoundaries");
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            this.settings.showTransactionBoundaries ? tb.show() : tb.hide();
        }

        if (settings.fitOnDrilldown !== undefined) {
            this.applyFitOnDrilldown();
        }

        if (settings.favouriteBpmnElements !== undefined) {
            const appendMenuOverride = this.getModeler().get<any>("appendMenuOverride", false);
            if (appendMenuOverride) {
                appendMenuOverride.setFavourites(settings.favouriteBpmnElements);
            }
        }
    }

    /**
     * Pushes the current `fitOnDrilldown` setting into the service. It is
     * always registered and reads the flag per `root.set`, so the toggle takes
     * effect on the next drill-down rather than on a rebuilt modeler.
     */
    private applyFitOnDrilldown(): void {
        this.getModeler()
            .get<DrilldownFit>("drilldownFit", false)
            ?.setEnabled(this.settings.fitOnDrilldown === true);
    }

    /**
     * Triggers the align-to-origin plugin if the setting is enabled.
     *
     * @internal Host-adapter surface (invoked on save by the VS Code editor
     *   controller); folded behind the `alignToOrigin` setting in the public API.
     */
    alignElementsToOrigin(): void {
        if (this.settings.alignToOrigin) {
            this.getModeler().get<any>("alignToOrigin").align();
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
    getService(name: string): any {
        return this.getModeler().get(name);
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
     * @internal Host-adapter surface (inline-scripting capability).
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
     * @internal Host-adapter surface (inline-scripting capability).
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
     * @internal Host-adapter surface (inline-scripting capability).
     */
    applyOpenScriptEditors(refs: OpenScriptEditorRef[]): void {
        this.getModeler().get<OpenScriptEditorsStore>("openScriptEditorsStore", false)?.set(refs);
    }

    /**
     * Switches the colour theme live. Page-level theme state is a module
     * singleton (one `#theme-link`), so `"automatic"` follows the OS/browser
     * `prefers-color-scheme` live while `"light"`/`"dark"` force a fixed
     * stylesheet. A host that themes off its own chrome maps that signal to a
     * forced mode at the adapter.
     */
    setTheme(theme: ThemeMode): void {
        setThemeMode(theme);
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
     * @internal Host-adapter surface (code-link capability).
     */
    applyImplementationStatus(resolved: Record<string, boolean>): void {
        this.getModeler().get<CodeLinkMapClient>("codeLinkMapClient", false)?.applyStatus(resolved);
    }

    /**
     * Emits a non-fatal warning to the console (preserved for dev/tests) and, if
     * a host sink is wired via the `onWarning` option, forwards it to the channel.
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
