// bpmn.js
import type { ImportXMLResult } from "bpmn-js/lib/BaseViewer";

import {
    BpmnFileQuery,
    BpmnlintResultsQuery,
    BpmnModelerSettingQuery,
    ClipboardQuery,
    Command,
    ElementTemplatesQuery,
    FlushDocumentQuery,
    FocusElementQuery,
    FormReferenceStatusQuery,
    GetBpmnFileCommand,
    BpmnlintInPageQuery,
    GetBpmnlintConfigCommand,
    GetBpmnModelerSettingCommand,
    GetClipboardCommand,
    GetDiagramAsSVGCommand,
    GetElementTemplatesCommand,
    GetFormReferenceStatusCommand,
    GetPropertiesPanelStateCommand,
    GetTextClipboardCommand,
    ImplementationStatusQuery,
    LanguageQuery,
    LogErrorCommand,
    LogWarningCommand,
    NavigateToImplementationCommand,
    NavigateToReferencedModelCommand,
    OpenScriptEditorCommand,
    OpenScriptEditorsCommand,
    PropertiesPanelStateQuery,
    Query,
    ReleaseDocumentFlushQuery,
    SetClipboardCommand,
    SetLintingEnabledCommand,
    SetPropertiesPanelStateCommand,
    SetTextClipboardCommand,
    SyncActivitiesCommand,
    SyncDocumentCommand,
    TextClipboardQuery,
    UpdateLintResultsCommand,
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
    UpdateScriptSourceCommand,
    UpdateScriptVariablesCommand,
    createFlushResponder,
    createResolver,
    extractProcessVariables,
    initResizer,
    installPanelShortcuts,
    defaultMode,
    isModeAvailable,
    mountModeStrip,
    planTransition,
    resolveInitialMode,
    type ModeStrip,
    type SurfaceMode,
} from "@miragon/bpmn-modeler-shared";
import {
    NoModelerError,
    asyncDebounce,
    formatErrors,
    observeCanvasSize,
    serializeAsync,
    type DetectedEngine,
} from "@miragon/bpmn-modeler-types";
import {
    type HostThemeAdapter,
    applyPageThemeScope,
    createHostThemeAdapter,
    resolveHostThemeKind,
} from "./hostTheme";
import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";
import { createModeler, UnsupportedEngineError } from "@miragon/bpmn-modeler";
import { createViewer } from "@miragon/bpmn-modeler/viewer";
import { createDesigner } from "@miragon/bpmn-modeler/design";
import type {
    ClipboardOptions,
    LintingOptions,
    ModelerCapabilities,
    ModelerMode,
} from "@miragon/bpmn-modeler";
import type { HostApi } from "@miragon/bpmn-modeler-shared";
import type { LintRunEvent, ResizableCanvas } from "@miragon/bpmn-modeler-types";
import type { WebviewState } from "./webviewState";
import { DiffMode } from "./diffMode";
import { installHostEditorActions } from "./hostEditorActions";
import { readSavedMode, readSavedPanelVisibility, WebviewStateManager } from "./state";
import { isEditableHandle, isModelerHandle, type SurfaceHandle } from "./surface";
import "./modeStrip.css";

/**
 * Upper bound (ms) on how long bootstrap waits for a host reply before
 * continuing without it. A dropped element-templates / settings / panel-state
 * reply would otherwise stall the whole restore chain (selection, panel UI
 * state, and — critically — {@link WebviewStateManager.startPersisting}, without
 * which nothing is ever written back to webview state). Late replies still apply
 * through their normal message handlers.
 */
const RESOLVER_TIMEOUT_MS = 5000;

/**
 * Starts the BPMN webview against the given host. The entry (real or demo)
 * chooses the host, any host-specific bpmn-js modules, and — optionally — the
 * per-feature {@link ModelerCapabilities}. Omitting `capabilities` selects the
 * full protocol adapter, so every real host keeps all features; passing a
 * partial object turns off the features whose ports it omits.
 */
export function bootstrap(
    injectedHost: HostApi<WebviewState, Command | Query>,
    opts: {
        extraModules?: unknown[];
        capabilities?: ModelerCapabilities;
        linting?: LintingOptions;
        clipboard?: ClipboardOptions | "native";
        onLintResults?: (event: LintRunEvent) => void;
        reload?: () => void;
    } = {},
): void {
    startSession(
        injectedHost,
        opts.extraModules,
        opts.capabilities,
        opts.linting,
        opts.clipboard,
        opts.onLintResults,
        opts.reload,
    );
}

/**
 * One webview session. The modeler, resolvers, debounced syncs, flush
 * responder, and the "is initialized" latch are scoped to this closure so a
 * session owns its own lifetime rather than a page-wide singleton — the
 * prerequisite for hosting more than one modeler on a page. Single-instance
 * hosts (VS Code, IntelliJ, Theia) call {@link bootstrap} exactly once.
 *
 * @param host The injected host adapter.
 * @param injectedModules Host-specific extra bpmn-js DI modules.
 * @param injectedCapabilities Explicit per-feature ports; `undefined` selects
 *   the full protocol adapter so every real host keeps all features.
 * @param injectedLinting The bpmnlint tier; `undefined` selects the external
 *   (host-pushed) tier that real hosts use.
 * @param injectedClipboard The clipboard tier; `undefined` selects dev-build
 *   native, otherwise the protocol bridge. `"native"` forces the browser
 *   clipboard (demo/browser consumers); `{ bridge }` routes through a
 *   caller-supplied override.
 * @param injectedOnLintResults In-page lint-run sink; only a consumer opting into
 *   in-page linting (the demo) passes one. Real hosts run the linter themselves.
 * @param injectedReload Restarts the containing webview after an engine change.
 */
function startSession(
    host: HostApi<WebviewState, Command | Query>,
    injectedModules: unknown[] | undefined,
    injectedCapabilities: ModelerCapabilities | undefined,
    injectedLinting: LintingOptions | undefined,
    injectedClipboard: ClipboardOptions | "native" | undefined,
    injectedOnLintResults: ((event: LintRunEvent) => void) | undefined,
    injectedReload: (() => void) | undefined,
): void {
    // The single live surface (View / Design / Implement). Assigned in run()
    // once the engine + initial mode are known, and reassigned on every mode
    // switch — flush/capability callbacks only fire post-init, so the
    // definite-assignment assertion is safe.
    let surface!: SurfaceHandle;
    // The mode the live surface renders, and the segmented control that drives
    // it. `switchPending` blocks re-entrant switches while a recreate is in
    // flight; `disposeCanvasObserver` tears down the per-surface size observer.
    let surfaceMode!: SurfaceMode;
    let strip!: ModeStrip;
    let switchPending = false;
    let disposeCanvasObserver: (() => void) | undefined;

    let modelerIsInitialized = false;
    let modelerCanImportHostUpdates = false;
    let inertBeforeDestructiveFlush: boolean | undefined;
    let hostUpdateVersion = 0;
    let hostDocumentRevision = 0;
    let latestHostDocumentRevision = 0;
    let initialBpmnFileReceived = false;
    let initialViewerMode = false;
    let latestBpmnFileQuery: BpmnFileQuery | undefined;
    let refreshDiagramWhenReady = false;
    let modelerEngine: DetectedEngine;
    // Host theme adapter (VS Code `<body>` class → page scope + instance theme).
    // Created in run(); the settings handler switches its mode on `colorTheme`.
    let themeAdapter: HostThemeAdapter | undefined;
    let engineReloadPending = false;
    let pendingSessionActionDrain: Promise<void> | undefined;
    let cancelPendingVariablePublish: (() => void) | undefined;
    let availableProtocolFormIds = new Set<string>();
    const referenceAvailabilityListeners = new Set<() => void>();

    // A FocusElementQuery can arrive before the import finishes (host opens the
    // editor and focuses in one tick); apply it once the modeler is ready.
    let pendingFocusId: string | undefined;

    // The opaque config-version token from the host's last BpmnlintInPageQuery,
    // echoed back on every UpdateLintResultsCommand so the host can pair a run
    // with the config version it linted and drop a stale run. `undefined` for
    // the payload-free default tier (and reset to it on config→no-config).
    //
    // Pairing is race-free without any per-run plumbing: BrowserLinter.run is a
    // pure microtask chain (bpmnlint over the in-memory tree, no I/O), so it
    // drains to its onLintResults synchronously-after-await, before the next host
    // message can be delivered as a fresh macrotask and swap this closure. So the
    // token read here always belongs to the config that drove this very run.
    let currentLintConfigToken: string | undefined;

    // Separate resolvers for element clipboard and text (label) clipboard.
    let elementClipboardResolver = createResolver<ClipboardQuery>();
    let textClipboardResolver = createResolver<TextClipboardQuery>();

    const bpmnFileResolver = createResolver<BpmnFileQuery>();

    // Resolvers that signal when element templates and settings have been
    // applied. Selection restore is deferred until both complete so that
    // side-effects (e.g. transaction-boundary rendering) do not clear the
    // restored selection.
    const elementTemplatesResolver = createResolver<ElementTemplatesQuery>();
    const settingsResolver = createResolver<BpmnModelerSettingQuery>();

    // Resolves once the host has replied with the global properties-panel
    // default. The webview uses this value only when its own webview state has
    // no panelVisible entry — see WebviewStateManager.restorePanelVisibility.
    const panelStateResolver = createResolver<PropertiesPanelStateQuery>();

    /**
     * State manager for persisting and restoring viewport/selection across tab
     * switches. Initialised after the modeler is created.
     */
    let stateManager: WebviewStateManager;

    /**
     * Debounce the update of the XML content to avoid too many updates.
     */
    const serializedModelerOperation = serializeAsync(
        async (operation: () => Promise<void>): Promise<void> => operation(),
    );
    const serializedOpenXml = (bpmn: string | undefined, documentRevision: number): Promise<void> =>
        serializedModelerOperation(() => reloadXmlPreservingView(bpmn, documentRevision));
    const debouncedUpdateXML = asyncDebounce(serializedOpenXml, 100);

    /**
     * Debounces the outbound document sync so a burst of model changes (e.g.
     * properties-panel typing) collapses into one full export + host write
     * instead of one per keystroke. `maxWait` bounds starvation: sustained
     * typing still syncs at least once per second. 300ms/1000ms mirrors the
     * script-streaming debounce. The host recovers the sub-300ms tail via the
     * flush protocol ({@link respondToFlush}) so a save never persists stale XML.
     */
    const debouncedSendXmlChanges = asyncDebounce(sendXmlChanges, 300, { maxWait: 1000 });

    async function flushPendingXmlChanges(): Promise<void> {
        while (debouncedSendXmlChanges.pending()) {
            await debouncedSendXmlChanges.flush();
        }
    }

    function reportHostImportError(error: unknown): void {
        const cause = error instanceof Error ? error : new Error(String(error));
        host.postMessage(
            new LogErrorCommand(`Unable to open host XML\n${cause.message}`, cause.stack),
        );
    }

    async function flushPendingHostUpdates(): Promise<void> {
        while (debouncedUpdateXML.pending()) {
            try {
                await debouncedUpdateXML.flush();
            } catch (error) {
                reportHostImportError(error);
            }
        }
    }

    async function reloadForEngineChange(): Promise<void> {
        if (engineReloadPending) return;
        engineReloadPending = true;
        modelerIsInitialized = false;
        modelerCanImportHostUpdates = false;
        debouncedSendXmlChanges.cancel();
        debouncedUpdateXML.cancel();
        cancelPendingVariablePublish?.();
        refreshDiagramWhenReady = false;
        pendingFocusId = undefined;
        inertBeforeDestructiveFlush = undefined;
        document.body.inert = true;

        await serializedModelerOperation(async () => {
            try {
                debouncedSendXmlChanges.cancel();
                debouncedUpdateXML.cancel();
                await debouncedSendXmlChanges.flush();
                stateManager?.flushViewport();
            } finally {
                try {
                    surface.destroy();
                } finally {
                    (injectedReload ?? (() => window.location.reload()))();
                }
            }
        });
    }

    function drainPendingSessionActions(): Promise<void> {
        if (!pendingSessionActionDrain) {
            pendingSessionActionDrain = (async () => {
                while (!engineReloadPending) {
                    await flushPendingHostUpdates();
                    if (engineReloadPending) return;

                    if (refreshDiagramWhenReady) {
                        refreshDiagramWhenReady = false;
                        try {
                            await serializedModelerOperation(refreshDiagram);
                        } catch (error) {
                            const cause = error instanceof Error ? error : new Error(String(error));
                            host.postMessage(
                                new LogErrorCommand(
                                    `Unable to refresh diagram\n${cause.message}`,
                                    cause.stack,
                                ),
                            );
                        }
                        if (engineReloadPending) return;
                        continue;
                    }

                    if (debouncedUpdateXML.pending()) {
                        continue;
                    }

                    if (pendingFocusId !== undefined) {
                        surface.viewport.centerOnElement(pendingFocusId);
                        pendingFocusId = undefined;
                    }
                    return;
                }
            })().finally(() => {
                pendingSessionActionDrain = undefined;
            });
        }
        return pendingSessionActionDrain;
    }

    /**
     * Answers a host {@link FlushDocumentQuery} on the save/close path: exports
     * and returns the pending XML (or reports nothing-pending). The `pending()`
     * gate and cancel-and-carry rationale live in {@link createFlushResponder}.
     */
    const respondToFlush = createFlushResponder(
        {
            isReady: () => modelerIsInitialized,
            hasPendingSync: () => debouncedSendXmlChanges.pending(),
            hasPendingHostUpdate: () => debouncedUpdateXML.pending(),
            hostUpdateVersion: () => hostUpdateVersion,
            documentRevision: () => hostDocumentRevision,
            flushPendingSync: flushPendingXmlChanges,
            beginDestructiveFlush: () => {
                if (inertBeforeDestructiveFlush === undefined) {
                    inertBeforeDestructiveFlush = Boolean(document.body.inert);
                    document.body.inert = true;
                }
            },
            endDestructiveFlush: () => {
                if (inertBeforeDestructiveFlush === undefined) return;
                if (engineReloadPending) {
                    inertBeforeDestructiveFlush = undefined;
                    return;
                }
                document.body.inert = inertBeforeDestructiveFlush;
                inertBeforeDestructiveFlush = undefined;
            },
            exportContent: () => surface.exportDiagram(),
        },
        (reply) => host.postMessage(reply),
    );

    // Global safety net for throws the per-message try/catch in onReceiveMessage
    // can't reach — bpmn-js event-bus callbacks (e.g. onCommandStackChanged) run
    // outside it, so an error there would otherwise vanish into the webview
    // console and never reach the output channel.
    function registerGlobalErrorHandlers(): void {
        window.addEventListener("error", (event: ErrorEvent) => {
            host.postMessage(
                new LogErrorCommand(`Unhandled error: ${event.message}`, event.error?.stack),
            );
        });
        window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
            const reason: unknown = event.reason;
            host.postMessage(
                new LogErrorCommand(
                    `Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
                    reason instanceof Error ? reason.stack : undefined,
                ),
            );
        });
    }

    /**
     * Re-imports the XML while preserving the user's drill-down plane, viewbox,
     * and selection. The snapshot is taken from the live canvas inside the
     * debounced function so a burst of host pushes captures once, not from a
     * half-imported intermediate.
     */
    async function reloadXmlPreservingView(
        bpmn: string | undefined,
        documentRevision: number,
    ): Promise<void> {
        const snapshot = stateManager?.captureViewState();
        try {
            await openHostXml(bpmn, documentRevision);
        } finally {
            // Re-apply even when a post-import side-effect threw — the import
            // itself already reset the canvas to the top-level plane, and
            // skipping the restore would strand the user there.
            if (snapshot) {
                stateManager.applyViewState(snapshot);
            }
        }
    }

    /**
     * The default capability adapter: each port posts the protocol command to
     * the host. Selected whenever `bootstrap()` is called without explicit
     * capabilities, so every real host (VS Code, IntelliJ, Theia) runs through
     * it. Closes over the session {@link host} and {@link surface}.
     *
     * `scripting` is always populated here even though its DI cluster is C7-only;
     * `capabilityModules` gates the registration, so the surplus port on C8 is inert.
     */
    function createProtocolCapabilities(): ModelerCapabilities {
        return {
            modelNavigation: {
                openReference: ({ id, kind }) =>
                    host.postMessage(new NavigateToReferencedModelCommand(id, kind)),
                isReferenceAvailable: ({ id, kind }) =>
                    kind !== "form" || availableProtocolFormIds.has(id),
                onReferenceAvailabilityChanged: (listener) => {
                    referenceAvailabilityListeners.add(listener);
                    return () => referenceAvailabilityListeners.delete(listener);
                },
            },
            codeLink: {
                navigateToImplementation: (reference, kind) =>
                    host.postMessage(new NavigateToImplementationCommand(reference, kind)),
                syncActivities: (entries) => host.postMessage(new SyncActivitiesCommand(entries)),
            },
            scripting: {
                // The process-variable model is re-extracted per open so
                // completion reflects the diagram at the moment the tab opens.
                openScriptEditor: (event) =>
                    host.postMessage(
                        new OpenScriptEditorCommand(
                            event.elementId,
                            event.kind,
                            event.listenerIndex,
                            event.eventName,
                            event.scriptFormat,
                            event.content,
                            // Scripting is a modeler-only cluster (C7), but the
                            // port closes over the polymorphic surface.
                            isModelerHandle(surface)
                                ? extractProcessVariables(surface.getDefinitions())
                                : [],
                        ),
                    ),
                scriptSourceChanged: (event) =>
                    host.postMessage(
                        new UpdateScriptSourceCommand(
                            event.elementId,
                            event.kind,
                            event.listenerIndex,
                            event.content,
                        ),
                    ),
            },
        };
    }

    /**
     * Entry point executed once the webview DOM is fully loaded.
     *
     * Registers the message listener first so no backend messages are missed,
     * then requests the BPMN file and waits for the reply before creating the
     * modeler. After the modeler is ready, secondary resources (element
     * templates, settings) are requested.
     *
     * There are two reasons the webview is built:
     * 1. A new `.bpmn` file was opened.
     * 2. The user switched away and back to the tab.
     */
    async function run(): Promise<void> {
        window.addEventListener("message", onReceiveMessage);

        // Merge the modeler's local overlay (mode-strip labels, script-lock
        // badges, C7/dmn-js internals the shared package lacks) onto the shared
        // dictionaries. createModeler/createDesigner also extend it, but the mode
        // strip mounts before any surface and a View-first start never builds a
        // modeler, so the webview extends here so the strip is translated either
        // way. Idempotent — a later surface's extend is a no-op merge.
        i18n.extend(i18nExtras);

        // Theme is host policy: drive the page-level scope (host chrome + the
        // viewer/diff branch, which has no modeler) and the modeler instance's
        // own theme off the VS Code `<body>`-class signal. The instance is also
        // born correct via `theme: resolveHostThemeKind()` below, so this mainly
        // covers the page chrome and later live theme switches.
        themeAdapter = createHostThemeAdapter((kind) => {
            applyPageThemeScope(kind);
            surface?.setTheme(kind);
        });
        themeAdapter.setMode("automatic");

        // Viewer mode (one side of a diff view) skips the resizer + properties
        // panel + palette, so we don't call initResizer() here — the chrome is
        // hidden by .viewer-mode CSS once we confirm the mode below. For the
        // modeler path, initResizer() is called after the branch check.

        // Resolve the clipboard option passed to createModeler. The package
        // builds the DI modules and installs the contenteditable/FEEL polyfill
        // from it, so the polyfill installs during createModeler.
        //
        // - `undefined` (default): in dev (plain-browser `serve`) the native
        //   browser clipboard handles copy/paste, so no option is passed;
        //   otherwise route both channels through the host.
        // - `"native"`: force the browser clipboard (demo/browser consumers) —
        //   no option, no polyfill.
        // - `{ bridge }`: public override — passed through unchanged; the
        //   package uses the single bridge for both element and text surfaces.
        let clipboard: ClipboardOptions | undefined;

        if (injectedClipboard === "native") {
            // Native browser clipboard: pass no option so bpmn-js's
            // NativeCopyPaste stays in charge.
        } else if (injectedClipboard) {
            clipboard = injectedClipboard;
        } else if (process.env.NODE_ENV !== "development") {
            const requestElementClipboard = async (): Promise<string> => {
                elementClipboardResolver = createResolver<ClipboardQuery>();
                host.postMessage(new GetClipboardCommand());
                const q = await elementClipboardResolver.wait();
                return q?.text ?? "";
            };
            const writeElementClipboard = (text: string): void => {
                host.postMessage(new SetClipboardCommand(text));
            };

            const requestTextClipboard = async (): Promise<string> => {
                textClipboardResolver = createResolver<TextClipboardQuery>();
                host.postMessage(new GetTextClipboardCommand());
                const q = await textClipboardResolver.wait();
                return q?.text ?? "";
            };
            const writeTextClipboard = (text: string): void => {
                host.postMessage(new SetTextClipboardCommand(text));
            };

            // Two independent protocol channels so element and label/FEEL
            // clipboards stay separate. The package installs the contenteditable
            // polyfill off the `text` bridge.
            clipboard = {
                bridge: {
                    requestClipboard: requestElementClipboard,
                    writeClipboard: writeElementClipboard,
                },
                text: {
                    requestClipboard: requestTextClipboard,
                    writeClipboard: writeTextClipboard,
                },
            };
        }

        host.postMessage(new GetBpmnFileCommand());

        const bpmnFileQuery = await bpmnFileResolver.wait();

        /**
         * Diff view: host told us this pane is one half of a diff, so bootstrap
         * the readonly DiffMode and skip the editable modeler entirely.
         */
        if (bpmnFileQuery?.viewerMode === "viewer") {
            document.body.classList.add("viewer-mode");
            const canvas = document.getElementById("js-canvas");
            const dropZone = document.getElementById("js-drop-zone");
            if (!canvas || !dropZone) {
                console.error("Diff mode: missing #js-canvas or #js-drop-zone");
                return;
            }
            const diffMode = new DiffMode(canvas, dropZone, host);
            await diffMode.startWith(bpmnFileQuery.content);
            return;
        }

        // Host HTML keeps its `js-canvas` / `js-properties-panel` ids; the
        // facade takes the resolved elements, not selectors, so a second modeler
        // (in-page diff) can pass its own DOM hosts with no ids.
        const canvasEl = document.getElementById("js-canvas");
        const propertiesPanelParent = document.getElementById("js-properties-panel");
        if (!canvasEl || !propertiesPanelParent) {
            host.postMessage(
                new LogErrorCommand("Missing #js-canvas or #js-properties-panel in host HTML"),
            );
            return;
        }

        // The mode strip + panel mount are created at runtime inside the host's
        // empty `#js-properties-panel` (all three shells ship only that host).
        // The strip sits above a scrolling mount; the mount — not the host — is
        // the properties-panel parent and the panel-shortcut root. `initResizer`
        // still binds to the host by its hard-coded id, so its collapse behaviour
        // is unchanged.
        propertiesPanelParent.classList.add("panel-host");
        const stripEl = document.createElement("div");
        stripEl.id = "js-mode-strip";
        stripEl.className = "mode-strip";
        const mountEl = document.createElement("div");
        mountEl.id = "js-properties-panel-mount";
        mountEl.className = "panel-mount";
        propertiesPanelParent.append(stripEl, mountEl);

        const propertiesPanelHandle = initResizer({
            getToggleLabel: (state) =>
                i18n.translate(
                    state === "collapsed" ? "Open properties panel" : "Close properties panel",
                ) + " (Shift+P)",
            onLabelChange: (apply) => i18n.onChange(apply),
        });

        // Early-apply this editor's own saved panel visibility (if any) before
        // diagram import so the panel snaps straight to the correct per-editor
        // state — no flash, no wait on the host round-trip, and it neutralizes
        // the stale global-default hint baked into the pre-rendered HTML. When
        // absent, the host global default is applied later (once its reply
        // arrives). Applied via the handle so the resizer's DOM-seeded
        // `isCollapsed` stays in sync.
        const savedPanelVisible = readSavedPanelVisibility(host);
        if (savedPanelVisible !== undefined) {
            propertiesPanelHandle.setVisible(savedPanelVisible);
        }

        // The engine may be undefined here — an untagged (engine-neutral) model
        // is first-class now and opens in Design. The initial mode resolves from
        // this editor's saved mode, then the host's default, then the engine's
        // own default, all vetted against availability by resolveInitialMode.
        const engine = bpmnFileQuery?.engine;
        modelerEngine = engine;
        const initialMode = resolveInitialMode(
            readSavedMode(host) ?? bpmnFileQuery?.defaultMode ?? null,
            engine,
        );
        surfaceMode = initialMode;

        const capabilities = injectedCapabilities ?? createProtocolCapabilities();
        const extraModules = (injectedModules as unknown[]) ?? [];
        const resizerEl = document.getElementById("js-panel-resizer") ?? undefined;

        const focusCanvas = (): void => surface.getService<{ focus(): void }>("canvas").focus();

        // Stands up the surface for `mode`, bound to the shared canvas + panel
        // mount. View → readonly viewer; Design on an untagged model → the
        // engine-neutral designer; Design/Implement on a tagged model → one
        // createModeler whose `mode` toggles live. Real hosts run the linter
        // themselves and push results, so the modeler's default tier is external
        // (the `/lint` subpath is imported lazily; the module cache makes repeat
        // switches free).
        async function createSurface(mode: SurfaceMode): Promise<SurfaceHandle> {
            const propertiesPanel = { parent: mountEl };
            // Born in the IDE's theme so the first frame paints correctly (a
            // forced kind, not "automatic" — the body class is the IDE signal).
            const theme = resolveHostThemeKind();
            const navigation = { modelNavigation: capabilities.modelNavigation };

            if (mode === "view") {
                return createViewer(canvasEl!, {
                    theme,
                    propertiesPanel,
                    capabilities: navigation,
                    additionalModules: extraModules,
                });
            }

            if (modelerEngine === undefined) {
                // Untagged model: Design is the editable engine-neutral surface
                // (View returned above; Implement is unavailable and unreachable).
                return createDesigner(canvasEl!, {
                    theme,
                    propertiesPanel,
                    clipboard,
                    capabilities: navigation,
                    additionalModules: extraModules,
                });
            }

            return createModeler(canvasEl!, {
                engine: modelerEngine,
                mode,
                theme,
                propertiesPanel,
                additionalModules: extraModules,
                clipboard,
                capabilities,
                linting: injectedLinting ?? {
                    results: "external",
                    module: await import("@miragon/bpmn-modeler/lint"),
                },
                onLintResults:
                    injectedOnLintResults ??
                    ((e: LintRunEvent) =>
                        host.postMessage(
                            new UpdateLintResultsCommand(
                                e.results,
                                [...e.unresolved],
                                currentLintConfigToken,
                            ),
                        )),
                onLintingToggled: (enabled: boolean) =>
                    host.postMessage(new SetLintingEnabledCommand(enabled)),
                onWarning: (warning: string) => host.postMessage(new LogWarningCommand(warning)),
                onElementTemplatesErrors: (errors: unknown[]) => {
                    for (const error of errors ?? []) {
                        const message = error instanceof Error ? error.message : String(error);
                        host.postMessage(
                            new LogWarningCommand(`Element template rejected: ${message}`),
                        );
                    }
                },
                // The single writer of `surfaceMode` on a live Design↔Implement
                // toggle, so the strip and the instance cannot drift.
                onModeChanged: (m: ModelerMode) => {
                    surfaceMode = m;
                    stateManager?.persistMode(m);
                    strip.render({ mode: m, engine: modelerEngine, busy: switchPending });
                },
                handleGlobalEscape: true,
            });
        }

        // Rebinds the per-surface subscriptions on every (re)creation: outbound
        // sync, the C7 variable publisher, the state manager, and the canvas-size
        // observer. All of these live on the instance and die with it, so a mode
        // switch that forgot to rebind would silently stop syncing/persisting.
        function bindSurface(handle: SurfaceHandle): void {
            // Outbound sync: the modeler exposes onCommandStackChanged; the
            // designer emits via the shared eventBus; the readonly viewer never
            // schedules a sync (so respondToFlush sees nothing pending in View).
            if (isModelerHandle(handle)) {
                handle.onCommandStackChanged(() => void debouncedSendXmlChanges());
            } else if (isEditableHandle(handle)) {
                handle
                    .getService<{ on(event: string, cb: () => void): void }>("eventBus")
                    .on("commandStack.changed", () => void debouncedSendXmlChanges());
            }

            // C7 process-variable publisher — modeler-only (scripting is a C7
            // cluster). Gated on the engine and the port being present, like the
            // capability that owns it.
            if (isModelerHandle(handle) && modelerEngine === "c7" && capabilities.scripting) {
                let lastVariablesJson = "";
                const sendVariables = asyncDebounce(async () => {
                    if (engineReloadPending) return;
                    const variables = extractProcessVariables(handle.getDefinitions());
                    const json = JSON.stringify(variables);
                    if (json === lastVariablesJson) {
                        return;
                    }
                    lastVariablesJson = json;
                    host.postMessage(new UpdateScriptVariablesCommand(variables));
                }, 300);
                cancelPendingVariablePublish = () => sendVariables.cancel();
                handle.onCommandStackChanged(() => {
                    if (!engineReloadPending) void sendVariables();
                });
                // commandStack.changed doesn't fire on import, and a webview
                // reload starts with an empty host-side store, so seed it.
                void sendVariables();
            } else {
                cancelPendingVariablePublish = undefined;
            }

            stateManager = new WebviewStateManager(host, handle, mountEl);

            const canvas = handle.getService<ResizableCanvas & { getContainer(): Element }>(
                "canvas",
            );
            disposeCanvasObserver = observeCanvasSize(canvas, canvas.getContainer(), {
                applyInitialViewport: () => stateManager.restoreViewport(),
            });
        }

        // Templates + lint config are modeler-only; a viewer/designer never
        // receives them, so its ElementTemplatesQuery would never arrive and the
        // restore chain's Promise.all would stall — resolve the templates gate
        // immediately instead.
        function requestSurfaceResources(): void {
            if (isModelerHandle(surface)) {
                host.postMessage(new GetElementTemplatesCommand());
                host.postMessage(new GetBpmnlintConfigCommand());
            } else {
                elementTemplatesResolver.done(undefined);
            }
        }

        /**
         * Requests a switch to `target`. Unavailable targets, and requests while a
         * switch or engine reload is in flight, are ignored. Design↔Implement on a
         * tagged model is a live `setMode` toggle; anything else recreates.
         */
        async function requestMode(target: SurfaceMode): Promise<void> {
            if (!isModeAvailable(target, modelerEngine)) return;
            if (switchPending || engineReloadPending) return;
            const kind = planTransition(surfaceMode, target, modelerEngine);
            if (kind === "none") return;
            if (kind === "toggle") {
                if (isModelerHandle(surface)) {
                    surface.setMode(target as ModelerMode);
                }
                return;
            }
            await switchSurface(target);
        }

        /**
         * Destroys the live surface and stands up `target`, handing the view state
         * over. Serialised against the other modeler operations; `document.body.inert`
         * blocks mutation (and strip clicks) during the handle-less window. The
         * export runs before the destroy, so an export failure keeps the old
         * instance; a failure past the destroy falls back to the engine default so
         * the page is never handle-less.
         */
        async function switchSurface(target: SurfaceMode): Promise<void> {
            await serializedModelerOperation(async () => {
                switchPending = true;
                strip.render({ mode: surfaceMode, engine: modelerEngine, busy: true });
                const restoreInert = Boolean(document.body.inert);
                document.body.inert = true;
                let destroyed = false;
                let carriedXml = "";
                try {
                    await flushPendingXmlChanges();
                    debouncedSendXmlChanges.cancel();
                    cancelPendingVariablePublish?.();
                    const snapshot = surface.captureViewState();
                    // Export before the destroy: a failure here throws with the old
                    // instance still live, so the catch has nothing to rebuild.
                    carriedXml = await surface.exportDiagram();
                    disposeCanvasObserver?.();
                    surface.destroy();
                    destroyed = true;
                    surface = await createSurface(target);
                    surfaceMode = target;
                    bindSurface(surface);
                    await surface.loadDiagram(carriedXml);
                    surface.applyViewState(snapshot);
                    stateManager.restorePanelUiState();
                    stateManager.startPersisting();
                    stateManager.persistMode(target);
                    requestSurfaceResources();
                } catch (error) {
                    const cause = error instanceof Error ? error : new Error(String(error));
                    host.postMessage(
                        new LogErrorCommand(`Unable to switch mode\n${cause.message}`, cause.stack),
                    );
                    if (destroyed) {
                        // Past the destroy — the page must never be handle-less.
                        const fallback = defaultMode(modelerEngine);
                        surface = await createSurface(fallback);
                        surfaceMode = fallback;
                        bindSurface(surface);
                        await surface.loadDiagram(carriedXml);
                        stateManager.startPersisting();
                        stateManager.persistMode(fallback);
                        requestSurfaceResources();
                    }
                } finally {
                    switchPending = false;
                    // A concurrent engine reload owns `inert` from here on.
                    if (!engineReloadPending) {
                        document.body.inert = restoreInert;
                    }
                    strip.render({ mode: surfaceMode, engine: modelerEngine, busy: false });
                }
            });
        }

        strip = mountModeStrip({
            host: propertiesPanelParent,
            stripEl,
            resizerEl,
            panelHandle: propertiesPanelHandle,
            translate: (template, replacements) => i18n.translate(template, replacements),
            onLabelChange: (apply) => i18n.onChange(apply),
            onSelect: (mode) => void requestMode(mode),
            onEscape: focusCanvas,
        });
        strip.render({ mode: initialMode, engine, busy: true });

        try {
            surface = await createSurface(initialMode);
        } catch (error: any) {
            if (error instanceof NoModelerError || error instanceof UnsupportedEngineError) {
                host.postMessage(new LogErrorCommand(error.message));
            } else {
                host.postMessage(new LogErrorCommand(`Unable to open XML\n${error.message}`));
            }
            return;
        }

        let importedBpmnFileQuery = latestBpmnFileQuery ?? bpmnFileQuery;
        while (importedBpmnFileQuery) {
            if (importedBpmnFileQuery.engine !== modelerEngine) {
                await reloadForEngineChange();
                return;
            }
            try {
                await serializedOpenXml(
                    importedBpmnFileQuery.content,
                    importedBpmnFileQuery.documentRevision,
                );
                break;
            } catch (error) {
                if (latestBpmnFileQuery && latestBpmnFileQuery !== importedBpmnFileQuery) {
                    reportHostImportError(error);
                    importedBpmnFileQuery = latestBpmnFileQuery;
                    continue;
                }
                const message = error instanceof Error ? error.message : String(error);
                host.postMessage(new LogErrorCommand(`Unable to open XML\n${message}`));
                return;
            }
        }

        modelerCanImportHostUpdates = true;

        if (latestBpmnFileQuery && latestBpmnFileQuery !== importedBpmnFileQuery) {
            if (latestBpmnFileQuery.engine !== modelerEngine) {
                await reloadForEngineChange();
                return;
            }
            try {
                await debouncedUpdateXML(
                    latestBpmnFileQuery.content,
                    latestBpmnFileQuery.documentRevision,
                );
            } catch (error) {
                reportHostImportError(error);
            }
        }
        await flushPendingHostUpdates();
        if (engineReloadPending) return;

        const currentBpmnFileQuery = latestBpmnFileQuery ?? bpmnFileQuery;

        if (currentBpmnFileQuery?.engine === "c8" && injectedCapabilities === undefined) {
            host.postMessage(new GetFormReferenceStatusCommand());
        }

        console.debug("[DEBUG] Modeler is initialized...");

        bindSurface(surface);

        // Lets the IntelliJ JCEF host drive undo/redo: it swallows Ctrl+Z/Ctrl+Y
        // at the IDE level before bpmn-js sees them. Installed once, over the
        // polymorphic surface; the readonly viewer has no editorActions service,
        // so the trigger is guarded.
        installHostEditorActions((action) => {
            if (isEditableHandle(surface)) {
                surface
                    .getService<{ trigger(action: string): void }>("editorActions")
                    .trigger(action);
            }
        });

        // Phase 1: restore viewport (canvas exists after openXml). Retried from
        // the observer because hosts mount the webview before laying it out.
        stateManager.restoreViewport();

        await drainPendingSessionActions();
        if (engineReloadPending) return;
        modelerIsInitialized = true;
        // Templates + lint config are modeler-only; settings + panel state always.
        requestSurfaceResources();
        host.postMessage(new GetBpmnModelerSettingCommand());
        host.postMessage(new GetPropertiesPanelStateCommand());

        // Panel visibility: this editor's own saved entry (applied early above)
        // wins. Only when absent do we fall back to the host's global default —
        // the seed for a first-ever open. This branch is deliberately *not*
        // gated on templates/settings, so a slow or dropped templates reply
        // cannot leave the panel stuck at the pre-rendered default.
        if (savedPanelVisible === undefined) {
            const panelStateQuery = await panelStateResolver.wait(RESOLVER_TIMEOUT_MS);
            if (engineReloadPending) return;
            stateManager.restorePanelVisibility(
                propertiesPanelHandle,
                panelStateQuery?.visible ?? true,
            );
        }

        // Report user toggles: persist this editor's own state AND update the
        // host's global default so the latest preference seeds new editors.
        // Registered after restore so the restore itself can't echo back.
        propertiesPanelHandle.onVisibilityChanged((visible) => {
            stateManager.persistPanelVisibility(visible);
            host.postMessage(new SetPropertiesPanelStateCommand(visible));
        });

        // `p` focuses the panel mount (expanding it first if collapsed); `Shift+P`
        // toggles panel visibility. Installed once, over the polymorphic surface.
        installPanelShortcuts(
            {
                handle: propertiesPanelHandle,
                focusCanvas,
                isCanvasFocused: () =>
                    surface.getService<{ isFocused(): boolean }>("canvas").isFocused(),
            },
            { getPanelRoot: () => mountEl },
        );

        // Selection + panel-side UI state must wait until element-template and
        // settings side-effects have run (they clear selection; group indexes are
        // positional per selected element). The timeouts guarantee this chain
        // always reaches startPersisting even if a host reply is dropped.
        await Promise.all([
            elementTemplatesResolver.wait(RESOLVER_TIMEOUT_MS),
            settingsResolver.wait(RESOLVER_TIMEOUT_MS),
        ]);
        if (engineReloadPending) return;

        // Phase 2: restore selection + panel-side UI state (side-effects done)
        stateManager.restoreSelection();
        stateManager.restorePanelUiState();

        // The initial surface is live: drop the strip's busy state and persist the
        // resolved mode so a first-ever open remembers where it landed.
        strip.render({ mode: surfaceMode, engine: modelerEngine, busy: false });
        stateManager.persistMode(surfaceMode);

        // Phase 3: begin persisting changes
        stateManager.startPersisting();
    }

    async function openHostXml(bpmn: string | undefined, documentRevision: number): Promise<void> {
        await openXml(bpmn);
        if (documentRevision === latestHostDocumentRevision) {
            hostDocumentRevision = documentRevision;
        }
    }

    /**
     * Loads or replaces the diagram in the modeler with the given BPMN XML.
     * Creates a blank diagram when `bpmn` is `undefined` or empty.
     *
     * @param bpmn BPMN XML string, or `undefined` for a new blank diagram.
     * @throws {NoModelerError} If the modeler is not available.
     */
    async function openXml(bpmn?: string): Promise<void> {
        let result: ImportXMLResult;
        // Only an editable surface can create a blank diagram; the readonly
        // viewer always loads the host XML (a diff/View pane never opens blank).
        if (!bpmn && isEditableHandle(surface)) {
            result = await surface.newDiagram();
        } else {
            result = await surface.loadDiagram(bpmn ?? "");
        }

        if (result.warnings.length > 0) {
            const warnings = `Diagram opened with following warnings: ${formatErrors(result.warnings)}`;
            host.postMessage(new LogWarningCommand(warnings));
        }
    }

    /**
     * Exports the current diagram XML and sends it to the backend to persist the
     * changes, then triggers an align-to-origin pass if the setting is enabled.
     *
     * Runs at debounce-fire time now, not per model change. Align-to-origin
     * therefore also runs debounced (and is skipped on the flush path, where we
     * only export); the next edit realigns. That align emits its own
     * `commandStack.changed`, which schedules one more debounced cycle — but a
     * no-op align executes no commands, so the cycle terminates rather than looping.
     */
    async function sendXmlChanges(): Promise<void> {
        // A rejection here only reaches the global unhandledrejection hook
        // (diagram-js discards the returned promise) as a context-free line —
        // catch it so the failure is named and deterministic on the channel.
        try {
            const version = hostUpdateVersion;
            const bpmn = await surface.exportDiagram();

            if (version !== hostUpdateVersion || debouncedUpdateXML.pending()) {
                return;
            }

            host.postMessage(new SyncDocumentCommand(bpmn, hostDocumentRevision));
            // Align-to-origin is a modeler-only feature; the designer/viewer skip it.
            if (isModelerHandle(surface)) {
                surface.alignElementsToOrigin();
            }
        } catch (error) {
            const e = error instanceof Error ? error : new Error(String(error));
            host.postMessage(
                new LogErrorCommand(`Failed to sync diagram changes: ${e.message}`, e.stack),
            );
        }
    }

    /**
     * Routes incoming messages from the host application to the appropriate
     * handler.
     *
     * @param message The raw `MessageEvent` from `window.addEventListener("message", …)`.
     */
    async function onReceiveMessage(message: MessageEvent<Query | Command>): Promise<void> {
        const queryOrCommand = message.data;
        if (
            engineReloadPending &&
            !["FlushDocumentQuery", "ReleaseDocumentFlushQuery"].includes(queryOrCommand.type)
        ) {
            return;
        }
        const errorPrefix = "Error receiving message: " + queryOrCommand.type + " — ";

        switch (true) {
            case queryOrCommand.type === "BpmnFileQuery": {
                try {
                    const bpmnFileQuery = message.data as BpmnFileQuery;
                    const documentRevision = bpmnFileQuery.documentRevision ?? 0;

                    if (documentRevision < latestHostDocumentRevision) break;

                    latestHostDocumentRevision = documentRevision;
                    hostUpdateVersion++;
                    latestBpmnFileQuery = bpmnFileQuery;

                    if (!initialBpmnFileReceived) {
                        initialBpmnFileReceived = true;
                        initialViewerMode = bpmnFileQuery.viewerMode === "viewer";
                        bpmnFileResolver.done(bpmnFileQuery);
                    } else if (!initialViewerMode) {
                        // A host push (e.g. a raw-XML side-by-side edit) is
                        // authoritative. Drop any pending outbound sync first so a
                        // stale export firing after the re-import can't clobber it.
                        debouncedSendXmlChanges.cancel();
                        if (modelerCanImportHostUpdates) {
                            if (bpmnFileQuery.engine !== modelerEngine) {
                                await reloadForEngineChange();
                                break;
                            }
                            try {
                                await debouncedUpdateXML(bpmnFileQuery.content, documentRevision);
                            } finally {
                                if (modelerIsInitialized) {
                                    await drainPendingSessionActions();
                                }
                            }
                        }
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "ElementTemplatesQuery": {
                const query = message.data as ElementTemplatesQuery;
                try {
                    console.debug("Received element templates: ", query.elementTemplates);
                    if (isModelerHandle(surface)) {
                        surface.setElementTemplates(query.elementTemplates);
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                } finally {
                    // Resolve even on a facade throw — otherwise the bootstrap
                    // await starves and startPersisting never runs.
                    elementTemplatesResolver.done(query);
                }
                break;
            }
            case queryOrCommand.type === "BpmnlintResultsQuery": {
                try {
                    const query = message.data as BpmnlintResultsQuery;
                    if (isModelerHandle(surface)) {
                        surface.applyLintResults(query.results);
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "BpmnLintDisabledQuery": {
                try {
                    if (isModelerHandle(surface)) {
                        surface.applyLintingDisabled();
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "BpmnlintInPageQuery": {
                try {
                    const q = message.data as BpmnlintInPageQuery;
                    // The token stays current for the onLintResults echo. Dedup of
                    // a repeat covered instruction lives in LintConfigService,
                    // where the tier state is known, so a stale token from an
                    // intervening disabled push cannot drop a re-enable.
                    currentLintConfigToken = q.configToken;
                    // No workspace config → engine-aware default; a covered config
                    // → lint it in-page. Either way onLintResults pushes the
                    // findings back so the host feeds its Problems panel + status bar.
                    if (isModelerHandle(surface)) {
                        surface.startInPageLinting(q.config, q.configToken);
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "BpmnModelerSettingQuery": {
                const query = message.data as BpmnModelerSettingQuery;
                try {
                    // Theme is host policy: the adapter drives the page scope +
                    // instance theme off the VS Code `<body>`-class watcher here,
                    // because the package's setSettings does not apply `colorTheme`.
                    themeAdapter?.setMode(query.setting.colorTheme);
                    // Theme always applies (page scope); the modeler-only settings
                    // (align, favourites, …) only reach a modeler surface.
                    if (isModelerHandle(surface)) {
                        surface.setSettings(query.setting);
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                } finally {
                    // Resolve even on a facade throw — otherwise the bootstrap
                    // await starves and startPersisting never runs.
                    settingsResolver.done(query);
                }
                break;
            }
            case queryOrCommand.type === "PropertiesPanelStateQuery": {
                panelStateResolver.done(message.data as PropertiesPanelStateQuery);
                break;
            }
            case queryOrCommand.type === "ClipboardQuery": {
                elementClipboardResolver.done(message.data as ClipboardQuery);
                break;
            }
            case queryOrCommand.type === "TextClipboardQuery": {
                textClipboardResolver.done(message.data as TextClipboardQuery);
                break;
            }
            case queryOrCommand.type === "LanguageQuery": {
                try {
                    const query = message.data as LanguageQuery;
                    // Switch the shared translator; the DI-bound service and all
                    // onChange subscribers (resizer, diff legend, …) pick it up.
                    // bpmn-js itself still needs a diagram re-import to re-invoke
                    // translate() for already-rendered elements — skipped in
                    // viewer mode where there is no editable modeler.
                    // The host pushes the language on every (re)load, not only on
                    // change. Compare resolved locales (setLanguage falls back to
                    // "en" for unknown codes) and skip the destructive re-import
                    // when nothing changed — a tab re-show must not re-import.
                    const localeBefore = i18n.getLocale();
                    i18n.setLanguage(query.locale as SupportedLocale);
                    if (i18n.getLocale() !== localeBefore) {
                        refreshDiagramWhenReady = !initialViewerMode;
                        if (modelerIsInitialized) {
                            await drainPendingSessionActions();
                        }
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "GetDiagramAsSVGCommand": {
                try {
                    const command = message.data as GetDiagramAsSVGCommand;
                    // Populate the SVG field and echo the command back to the host.
                    command.svg = await surface.getDiagramSvg();
                    host.postMessage(command);
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "OpenAllScriptTasksQuery": {
                try {
                    // Reply as a single bulk command so the host opens the scripts
                    // sequentially; the variable model is identical for every
                    // script in the diagram, so it is extracted once and shared.
                    // Script tasks are a modeler-only concern (no-op otherwise).
                    if (isModelerHandle(surface)) {
                        const scripts = surface.collectInlineScriptTasks();
                        host.postMessage(
                            new OpenScriptEditorsCommand(
                                scripts,
                                extractProcessVariables(surface.getDefinitions()),
                            ),
                        );
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "UpdateScriptContentQuery": {
                try {
                    const query = message.data as UpdateScriptContentQuery;
                    if (isModelerHandle(surface)) {
                        surface.updateScriptContent(
                            query.elementId,
                            query.kind,
                            query.listenerIndex,
                            query.content,
                        );
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "UpdateScriptFormatQuery": {
                try {
                    const query = message.data as UpdateScriptFormatQuery;
                    if (isModelerHandle(surface)) {
                        surface.updateScriptFormat(
                            query.elementId,
                            query.kind,
                            query.listenerIndex,
                            query.scriptFormat,
                        );
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "UpdateOpenScriptEditorsQuery": {
                try {
                    const query = message.data as UpdateOpenScriptEditorsQuery;
                    if (isModelerHandle(surface)) {
                        surface.applyOpenScriptEditors(query.openScripts);
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "ImplementationStatusQuery": {
                try {
                    const query = message.data as ImplementationStatusQuery;
                    if (isModelerHandle(surface)) {
                        surface.applyImplementationStatus(query.resolved);
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "FormReferenceStatusQuery": {
                try {
                    const query = message.data as FormReferenceStatusQuery;
                    const nextFormIds = new Set(query.formIds);
                    const changed =
                        nextFormIds.size !== availableProtocolFormIds.size ||
                        [...nextFormIds].some((formId) => !availableProtocolFormIds.has(formId));
                    availableProtocolFormIds = nextFormIds;
                    if (changed) {
                        referenceAvailabilityListeners.forEach((listener) => listener());
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "FocusElementQuery": {
                try {
                    const { elementId } = message.data as FocusElementQuery;
                    pendingFocusId = elementId;
                    if (modelerIsInitialized) {
                        await drainPendingSessionActions();
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case ["FlushDocumentQuery", "ReleaseDocumentFlushQuery"].includes(
                queryOrCommand.type,
            ): {
                await respondToFlush(
                    message.data as FlushDocumentQuery | ReleaseDocumentFlushQuery,
                );
                break;
            }
        }
    }

    /**
     * Re-renders the diagram by exporting and re-importing the XML.
     *
     * Preserves the current drill-down plane, viewport, and selection so the
     * user does not lose their place. Used after a language switch to force
     * bpmn-js to re-invoke `translate()` for all UI elements.
     */
    async function refreshDiagram(): Promise<void> {
        const xml = await surface.exportDiagram();
        const snapshot = stateManager.captureViewState();
        try {
            await surface.loadDiagram(xml);
        } finally {
            // Same rationale as reloadXmlPreservingView: the re-import has
            // already reset the plane, so restore even on a late throw.
            stateManager.applyViewState(snapshot);
        }
    }

    // Best-effort flush of the outbound sync debounce when the webview is hidden
    // (tab switch / close). Reliable in the persistent JCEF host; in VS Code the
    // webview context may be torn down mid-export, so this is a best-effort
    // mitigation of the ≤300ms hide-loss window — the save path is fully covered
    // by the flush protocol instead. Registered per-session (not at import) so a
    // torn-down session leaves no listener behind.
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && !engineReloadPending) {
            void debouncedSendXmlChanges.flush();
            stateManager?.flushViewport();
        }
    });

    registerGlobalErrorHandlers();
    if (document.readyState === "complete") {
        void run();
    } else {
        window.addEventListener("load", () => void run());
    }
}
