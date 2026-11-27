import type Modeler from "bpmn-js/lib/Modeler";
import type { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
import { applyImplementationStatus } from "@miragon/bpmn-modeler-code-link";
import { cleanupWithoutLayout, formatWithoutLayout } from "@miragon/bpmn-modeler-layout";
import type { LayoutOutcome, SurfaceInjector } from "@miragon/bpmn-modeler-layout";
import type { CleanupOutcome } from "@miragon/bpmn-modeler-types";
import {
    BpmnlintConfig,
    BpmnModelerSetting,
    describeScriptSurface,
    DisposableStore,
    type ElementIdProposals,
    elementIdSettingsOf,
    type ElementTemplateRef,
    LintResults,
    OpenScriptEditorRef,
    type ScriptField,
    type ScriptIdentity,
    ScriptKind,
    ScriptTaskScript,
} from "@miragon/bpmn-modeler-types";
import {
    applyOpenScriptEditors,
    collectInlineScriptTasks,
    writeSurfaceScriptField,
} from "@miragon/bpmn-modeler-inline-scripting";
import { lintElementIdConvention } from "../lintModules";
import { alignToOriginOf } from "../../alignToOrigin/service/alignToOriginAccessor";
import { appendMenuOf } from "../../appendMenu/service/appendMenuAccessor";
import { elementIdsOf } from "../../elementIds/service/elementIdsAccessor";
import { elementTemplatesOf } from "../../elementTemplates/service/elementTemplatesAccessor";
import { layoutOf } from "../../layout/service/layoutAccessor";
import { transactionBoundariesOf } from "../../transactionBoundaries/service/transactionBoundariesAccessor";
import type { ModalSurface } from "../../kernel/port/bpmnSurface";
import type { LintHandleMethods } from "../../kernel/service/lintHandle";
import { wireContentSaved } from "../../kernel/service/contentSaved";
import { createSurfaceLintHandle } from "../../kernel/service/editableSurface";
import { createReporter, type SurfaceReporter } from "../../kernel/service/reporting";
import type { SurfaceServices } from "../../kernel/service/surfaceCore";
import { initOrTeardown } from "../../kernel/service/surfaceLifecycle";
import type {
    RootElementManager,
    SelectionManager,
    ViewportManager,
} from "../../kernel/port/canvasManagers";
import type { ViewState } from "../../kernel/domain/viewState";
import type { ModelerMode } from "../../kernel/domain/surfaceMode";
import type {
    CoreModelerServices,
    CreateModelerOptions,
    ElementIdOptions,
} from "../../modeler/port/publicApi";
import type { ThemeMode } from "../../kernel/domain/themeMode";

interface OptionalLookup {
    get<T>(name: string, strict: false): T | null;
}

// A surface built without the layout feature never formats, so nothing to unsubscribe.
const NO_SUBSCRIPTION = (): void => undefined;

const DEFAULT_SETTINGS: BpmnModelerSetting = {
    alignToOrigin: false,
    showTransactionBoundaries: true,
    colorTheme: "automatic",
};

function servicesOf(surface: ModalSurface): SurfaceServices {
    return {
        service: (name) => surface.getService(name),
        optionalService: (name) =>
            surface.getService<OptionalLookup>("injector").get(name, false) ?? undefined,
    };
}

/** Carries the built surface into the constructor; module-private, so only the preset constructs. */
class SurfaceHandoff {
    constructor(readonly surface: ModalSurface) {}
}

// Assigned in the class's static block, so the factory reaches the private `attach`.
let attachModeler: (modeler: BpmnModeler) => void;

/** Wraps the surface `createModeler` built in `container`; a failure while attaching destroys it. */
export function bpmnModelerOver(
    container: HTMLElement,
    surface: ModalSurface,
    options: CreateModelerOptions,
): Promise<BpmnModeler> {
    return initOrTeardown(
        () => new BpmnModeler(container, options, new SurfaceHandoff(surface)),
        attachModeler,
    );
}

/**
 * An independent Camunda BPMN modeler with its own canvas and properties panel.
 * Create it with {@link createModeler}; accessors require a live instance.
 */
export class BpmnModeler {
    static {
        attachModeler = (modeler) => modeler.attach();
    }

    private settings: BpmnModelerSetting = { ...DEFAULT_SETTINGS };

    private readonly reporter: SurfaceReporter;

    private readonly lintHandle: LintHandleMethods;

    private readonly store = new DisposableStore();

    private deliverPendingContentSave: () => Promise<void> = () => Promise.resolve();

    private readonly surface: ModalSurface;

    /**
     * Throws unless {@link createModeler} calls it; kept public so 1.x code that names it compiles.
     *
     * @param _container The canvas host element; the surface already holds it.
     * @param options Per-instance config — see {@link CreateModelerOptions}.
     * @param wiring The surface `createModeler` built, opaque to callers.
     */
    constructor(
        _container: HTMLElement,
        private readonly options: CreateModelerOptions,
        wiring: unknown,
    ) {
        if (!(wiring instanceof SurfaceHandoff)) {
            throw new Error("Create a BpmnModeler with createModeler()");
        }
        this.surface = wiring.surface;
        this.reporter = createReporter({ onWarning: options.onWarning, onError: options.onError });
        this.lintHandle = createSurfaceLintHandle(servicesOf(this.surface), this.reporter);
    }

    private attach(): void {
        elementIdsOf(this.surface)?.configure({
            ...elementIdSettingsOf(this.settings),
            convention: lintElementIdConvention(this.options.linting),
        });
        transactionBoundariesOf(this.surface)?.setVisible(this.settings.showTransactionBoundaries);

        // Subscribe before initial templates are supplied so their validation errors are observed.
        const onElementTemplatesErrors = this.options.onElementTemplatesErrors;
        const templates = elementTemplatesOf(this.surface);
        if (onElementTemplatesErrors && templates) {
            this.store.add(templates.onErrors(onElementTemplatesErrors));
        }

        const onContentSaved = this.options.onContentSaved;
        if (onContentSaved) {
            this.deliverPendingContentSave = wireContentSaved({
                store: this.store,
                eventBus: this.surface.getService("eventBus"),
                exportDiagram: () => this.exportDiagram(),
                onContentSaved,
                reporter: this.reporter,
            });
        }
    }

    /**
     * Access the viewport manager while the modeler lives.
     */
    get viewport(): ViewportManager {
        return this.surface.viewport;
    }

    /**
     * Access the selection manager while the modeler lives.
     */
    get selection(): SelectionManager {
        return this.surface.selection;
    }

    /** Access the root element manager while the modeler lives. */
    get rootElement(): RootElementManager {
        return this.surface.rootElement;
    }

    /**
     * Snapshots the drill-down plane, viewbox, and selection so they survive an
     * instance switch (View ↔ Design ↔ Implement) — capture here, `destroy()`,
     * create the next instance, `loadDiagram`, then {@link applyViewState}. See
     * {@link ViewState} for the plane/selection degradation rules.
     */
    captureViewState(): ViewState {
        return this.surface.captureViewState();
    }

    /**
     * Re-applies a {@link captureViewState} snapshot, restoring plane, viewbox,
     * and selection in the required root → viewport → selection order.
     */
    applyViewState(state: ViewState): void {
        this.surface.applyViewState(state);
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
        this.surface.destroy();
    }

    /** @see BpmnModelerHandle.onCommandStackChanged */
    onCommandStackChanged(listener: () => void): () => void {
        return this.surface.onCommandStackChanged(listener);
    }

    /** @see BpmnModelerHandle.onFormatted */
    onFormatted(listener: (outcome: LayoutOutcome) => void): () => void {
        return layoutOf(this.surface)?.onFormatted(listener) ?? NO_SUBSCRIPTION;
    }

    /** @see PendingInputHandle.hasPendingInput */
    hasPendingInput(): boolean {
        return this.surface.hasPendingInput();
    }

    /** @see PendingInputHandle.flushPendingInput */
    flushPendingInput(): void {
        this.surface.flushPendingInput();
    }

    /** @internal See {@link PendingSaveHandle.flushContentSaved}. */
    flushContentSaved(): Promise<void> {
        return this.deliverPendingContentSave();
    }

    /**
     * Returns the live moddle definitions tree (`bpmn:Definitions` root) so
     * callers can walk the in-memory model — e.g. to extract process variables
     * for script IntelliSense — without round-tripping through XML.
     */
    getDefinitions(): ReturnType<Modeler["getDefinitions"]> {
        return this.surface.getService<Modeler>("bpmnjs").getDefinitions();
    }

    /** @internal */
    collectInlineScriptTasks(): ScriptTaskScript[] {
        return collectInlineScriptTasks(this.getService("elementRegistry"));
    }

    newDiagram(): Promise<ImportXMLResult> {
        return this.surface.newDiagram();
    }

    loadDiagram(bpmn: string): Promise<ImportXMLResult> {
        return this.surface.loadDiagram(bpmn);
    }

    /** @see BpmnSurfaceHandle.reloadDiagram */
    reloadDiagram(xml: string): Promise<ImportXMLResult> {
        return this.surface.reloadDiagram(xml);
    }

    exportDiagram(): Promise<string> {
        return this.surface.exportDiagram();
    }

    getDiagramSvg(): Promise<string> {
        return this.surface.getDiagramSvg();
    }

    /**
     * Rearranges the diagram left to right, applied as one undoable step.
     *
     * @see BpmnModelerHandle.formatDiagram
     */
    async formatDiagram(): Promise<LayoutOutcome> {
        return layoutOf(this.surface)?.formatDiagram() ?? formatWithoutLayout();
    }

    /**
     * Reports or removes diagram garbage.
     *
     * @see BpmnModelerHandle.cleanupDiagram
     */
    cleanupDiagram(options?: { apply?: boolean }): CleanupOutcome {
        return layoutOf(this.surface)?.cleanupDiagram(options) ?? cleanupWithoutLayout();
    }

    setElementTemplates(templates: object[]): void {
        elementTemplatesOf(this.surface)?.setTemplates(templates);
    }

    /** @see BpmnModelerHandle.setHiddenElementTemplates */
    setHiddenElementTemplates(refs: readonly ElementTemplateRef[]): void {
        elementTemplatesOf(this.surface)?.setHidden(refs);
    }

    setSettings(settings: Partial<BpmnModelerSetting> | undefined): void {
        if (!settings) {
            return;
        }
        // Throws NoModelerError on a destroyed modeler before any setting is kept.
        this.surface.getService("injector");
        this.settings = { ...this.settings, ...settings };

        // colorTheme stays inert here; the host controls theme through setTheme.

        if (settings.showTransactionBoundaries !== undefined) {
            transactionBoundariesOf(this.surface)?.setVisible(settings.showTransactionBoundaries);
        }

        if (settings.favouriteBpmnElements !== undefined) {
            appendMenuOf(this.surface)?.setFavourites(settings.favouriteBpmnElements);
        }

        elementIdsOf(this.surface)?.configure(elementIdSettingsOf(settings));
    }

    /** @see BpmnModelerHandle.setFavouriteBpmnElements */
    setFavouriteBpmnElements(types: readonly string[]): void {
        this.setSettings({ favouriteBpmnElements: [...types] });
    }

    /** @see BpmnModelerHandle.setElementIdSettings */
    setElementIdSettings({ followName, ...options }: ElementIdOptions): void {
        if (followName !== undefined) {
            this.setSettings({ elementIdsFollowName: followName });
        }
        elementIdsOf(this.surface)?.configure(options);
    }

    /** @see BpmnModelerHandle.proposeElementIds */
    proposeElementIds(unchecked?: readonly string[]): ElementIdProposals {
        return elementIdsOf(this.surface)?.propose(unchecked) ?? { rows: [] };
    }

    /** @see BpmnModelerHandle.renameElementIds */
    renameElementIds(unchecked: readonly string[]): number {
        return elementIdsOf(this.surface)?.rename(unchecked) ?? 0;
    }

    /** @internal */
    alignElementsToOrigin(): void {
        if (this.settings.alignToOrigin) {
            alignToOriginOf(this.surface)?.align();
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
        return this.surface.getService<T>(name);
    }

    /** @internal */
    updateScriptFormat(
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        scriptFormat: string,
    ): void {
        this.writeScriptField({ elementId, kind, listenerIndex }, "format", scriptFormat);
    }

    /** @internal */
    updateScriptContent(
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        content: string,
    ): void {
        this.writeScriptField({ elementId, kind, listenerIndex }, "content", content);
    }

    private writeScriptField(script: ScriptIdentity, field: ScriptField, value: string): void {
        const outcome = writeSurfaceScriptField(this.injector(), script, field, value);
        if (outcome === "elementNotFound") {
            this.reporter.warn(`Element not found: ${script.elementId}`);
        } else if (outcome === "noInlineScript") {
            const { elementId, kind, listenerIndex } = script;
            this.reporter.warn(
                `${describeScriptSurface(elementId, kind, listenerIndex)} has no inline script`,
            );
        }
    }

    /** @internal C7 only; C8 does not register the script-editor store. */
    applyOpenScriptEditors(refs: OpenScriptEditorRef[]): void {
        applyOpenScriptEditors(this.injector(), refs);
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
        this.surface.setTheme(theme);
    }

    /**
     * Switches Design / Implement without re-importing or losing engine data.
     * Fires onModeChanged once per actual change, after the panel, the mode
     * attribute and lint have followed it.
     */
    setMode(mode: ModelerMode): void {
        this.surface.setMode(mode);
    }

    /**
     * The current design/implement mode, held by the surface's `surfaceMode`.
     *
     * @throws {NoModelerError} If the modeler was destroyed.
     */
    getMode(): ModelerMode {
        return this.surface.getMode();
    }

    /** @internal A missing code-link capability must tolerate host status pushes. */
    applyImplementationStatus(resolved: Record<string, boolean>): void {
        applyImplementationStatus(this.injector(), resolved);
    }

    private injector(): SurfaceInjector {
        return this.surface.getService<SurfaceInjector>("injector");
    }
}
