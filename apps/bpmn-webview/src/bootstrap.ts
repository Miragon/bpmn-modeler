// bpmn.js
import { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
// css
import "./styles/default.css";
import "./styles/diff.css";
import "./styles/canvasFocusIndicator.css";

import {
    BpmnFileQuery,
    BpmnlintResultsQuery,
    BpmnModelerSettingQuery,
    ClipboardQuery,
    Command,
    ElementTemplatesQuery,
    FlushDocumentQuery,
    FocusElementQuery,
    GetBpmnFileCommand,
    BpmnlintInPageQuery,
    GetBpmnlintConfigCommand,
    GetBpmnModelerSettingCommand,
    GetClipboardCommand,
    GetDiagramAsSVGCommand,
    GetElementTemplatesCommand,
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
} from "@miragon/bpmn-modeler-shared";
import {
    Engine,
    NoModelerError,
    asyncDebounce,
    formatErrors,
    initResizer,
    initTheme,
    installPanelShortcuts,
    observeCanvasSize,
    setColorThemeMode,
} from "@miragon/bpmn-modeler-types";
import { createClipboardModules } from "@miragon/bpmn-modeler-clipboard";
import { TranslateModule, i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";
import {
    BpmnModeler,
    createModeler,
    installContentEditableClipboardPolyfill,
    UnsupportedEngineError,
} from "./app";
import type { HostApi } from "@miragon/bpmn-modeler-shared";
import type { LintRunEvent, ResizableCanvas } from "@miragon/bpmn-modeler-types";
import type { ModelerCapabilities } from "./app/capabilities";
import type { ClipboardOptions, LintingOptions } from "./app";
import type { WebviewState } from "./app/webviewState";
import { DiffMode } from "./app/diff/DiffMode";
import { installHostEditorActions } from "./app/hostEditorActions";
import { WebviewStateManager } from "./app/state";

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
    } = {},
): void {
    startSession(
        injectedHost,
        opts.extraModules,
        opts.capabilities,
        opts.linting,
        opts.clipboard,
        opts.onLintResults,
    );
}

/**
 * One webview session. All state that used to live at module scope — the
 * modeler, resolvers, debounced syncs, flush responder, the "is initialized"
 * latch — is folded into this closure so a session owns its own lifetime rather
 * than a page-wide singleton. The single-instance hosts (VS Code, IntelliJ,
 * Theia) call {@link bootstrap} exactly once, so behaviour is unchanged; the
 * closure is the prerequisite for the multi-instance facade (issue #1372).
 *
 * @param host The injected host adapter.
 * @param injectedModules Host-specific extra bpmn-js DI modules.
 * @param injectedCapabilities Explicit per-feature ports; `undefined` selects
 *   the full protocol adapter so every real host keeps all features.
 * @param injectedLinting The bpmnlint tier; `undefined` selects the external
 *   (host-pushed) tier so every real host stays byte-identical to today.
 * @param injectedClipboard The clipboard tier; `undefined` keeps today's
 *   behaviour (dev-build native, otherwise the protocol bridge). `"native"`
 *   forces the browser clipboard (demo/browser consumers, #1374); `{ bridge }`
 *   routes through a caller-supplied override.
 * @param injectedOnLintResults In-page lint-run sink; only a consumer opting into
 *   in-page linting (the demo) passes one. Real hosts run the linter themselves.
 */
function startSession(
    host: HostApi<WebviewState, Command | Query>,
    injectedModules: unknown[] | undefined,
    injectedCapabilities: ModelerCapabilities | undefined,
    injectedLinting: LintingOptions | undefined,
    injectedClipboard: ClipboardOptions | "native" | undefined,
    injectedOnLintResults: ((event: LintRunEvent) => void) | undefined,
): void {
    // Assigned in run() once the engine is known — flush/capability callbacks
    // only fire post-init, so the definite-assignment assertion is safe.
    let bpmnModeler!: BpmnModeler;

    let modelerIsInitialized = false;

    // A FocusElementQuery can arrive before the import finishes (host opens the
    // editor and focuses in one tick); apply it once the modeler is ready.
    let pendingFocusId: string | undefined;

    // The opaque config-version token from the host's last BpmnlintInPageQuery
    // (#1384), echoed back on every UpdateLintResultsCommand so the host can pair
    // a run with the config version it linted and drop a stale run. `undefined`
    // for the payload-free #1373 default tier (and reset to it on config→no-config).
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

    // Create resolver to wait for the response from the backend.
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
    const debouncedUpdateXML = asyncDebounce(reloadXmlPreservingView, 100);

    /**
     * Debounces the outbound document sync so a burst of model changes (e.g.
     * properties-panel typing) collapses into one full export + host write
     * instead of one per keystroke. `maxWait` bounds starvation: sustained
     * typing still syncs at least once per second. 300ms/1000ms mirrors the
     * script-streaming debounce. The host recovers the sub-300ms tail via the
     * flush protocol ({@link respondToFlush}) so a save never persists stale XML.
     */
    const debouncedSendXmlChanges = asyncDebounce(sendXmlChanges, 300, { maxWait: 1000 });

    /**
     * Answers a host {@link FlushDocumentQuery} on the save/close path: exports
     * and returns the pending XML (or reports nothing-pending). The `pending()`
     * gate and cancel-and-carry rationale live in {@link createFlushResponder}.
     */
    const respondToFlush = createFlushResponder(
        {
            isReady: () => modelerIsInitialized,
            hasPendingSync: () => debouncedSendXmlChanges.pending(),
            cancelPendingSync: () => debouncedSendXmlChanges.cancel(),
            exportXml: () => bpmnModeler.exportDiagram(),
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
    async function reloadXmlPreservingView(bpmn: string): Promise<void> {
        const snapshot = stateManager?.captureViewState();
        await openXml(bpmn);
        if (snapshot) {
            stateManager.applyViewState(snapshot);
        }
    }

    /**
     * The default capability adapter: each port posts the existing protocol
     * command to the host. Used whenever `bootstrap()` is called without
     * explicit capabilities, so VS Code / IntelliJ / Theia are unaffected by the
     * port indirection. Closes over the session {@link host} and {@link bpmnModeler}.
     *
     * `scripting` is always populated here even though its DI cluster is C7-only;
     * `capabilityModules` gates the registration, so the surplus port on C8 is inert.
     */
    function createProtocolCapabilities(): ModelerCapabilities {
        return {
            modelNavigation: {
                openReference: ({ id, kind }) =>
                    host.postMessage(new NavigateToReferencedModelCommand(id, kind)),
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
                            extractProcessVariables(bpmnModeler.getDefinitions()),
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

        // Merge the modeler's Camunda-7 / dmn-js / internal strings onto the
        // shared library's dictionaries before anything translates. The shared
        // package is C8-seeded and lacks these keys; without this bridge they
        // would render as English. extend() persists across setLanguage(), so
        // this single call at startup covers every later language switch and
        // both the modeler and the viewer-mode diff legend below.
        i18n.extend(i18nExtras);

        initTheme();

        // Viewer mode (one side of a diff view) skips the resizer + properties
        // panel + palette, so we don't call initResizer() here — the chrome is
        // hidden by .viewer-mode CSS once we confirm the mode below. For the
        // modeler path, initResizer() is called after the branch check.

        // Build clipboard DI modules.
        //
        // - `undefined` (default): today's behavior — in dev (plain-browser
        //   `serve`) the native browser clipboard handles copy/paste, so no
        //   modules load; otherwise route through the host protocol bridge.
        // - `"native"`: force the browser clipboard (demo/browser consumers) —
        //   no modules, no polyfill.
        // - `{ bridge }`: public override — one bridge drives both the element
        //   modules and the contenteditable polyfill.
        let clipboardModules: unknown[] | undefined;

        if (injectedClipboard === "native") {
            // Native browser clipboard: register nothing so bpmn-js's
            // NativeCopyPaste stays in charge (#1374).
        } else if (injectedClipboard) {
            const { bridge } = injectedClipboard;
            clipboardModules = createClipboardModules({ element: bridge });
            installContentEditableClipboardPolyfill(bridge.requestClipboard, bridge.writeClipboard);
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

            // Two independent protocol channels so element and label clipboards
            // stay separate — byte-identical to today's real-host wiring.
            clipboardModules = createClipboardModules({
                element: {
                    requestClipboard: requestElementClipboard,
                    writeClipboard: writeElementClipboard,
                },
                text: {
                    requestClipboard: requestTextClipboard,
                    writeClipboard: writeTextClipboard,
                },
            });

            /**
             * The FEEL editor (CodeMirror 6) in the C8 properties panel lives
             * outside the bpmn-js DI context, so the DI clipboard modules above
             * don't reach it. This polyfill intercepts Cmd/Ctrl+C/V on
             * contenteditable elements and bridges them through the extension
             * host clipboard, and guards Ctrl+A in text-editing surfaces from
             * being stolen by bpmn-js's Keyboard service (canvas Ctrl+A is owned
             * by bpmn-js's SelectionKeyBindings).
             */
            installContentEditableClipboardPolyfill(requestTextClipboard, writeTextClipboard);
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
            const diffMode = new DiffMode("#js-canvas", dropZone, host);
            await diffMode.startWith(bpmnFileQuery.content);
            return;
        }

        // Host HTML keeps its `js-canvas` / `js-properties-panel` ids; the
        // facade takes the resolved elements, not selectors, so a second modeler
        // (in-page diff, #1372) can pass its own DOM hosts with no ids.
        const canvasEl = document.getElementById("js-canvas");
        const propertiesPanelParent = document.getElementById("js-properties-panel");
        if (!canvasEl || !propertiesPanelParent) {
            host.postMessage(
                new LogErrorCommand("Missing #js-canvas or #js-properties-panel in host HTML"),
            );
            return;
        }

        const propertiesPanelHandle = initResizer({
            getToggleLabel: (state) =>
                i18n.translate(
                    state === "collapsed" ? "Open properties panel" : "Close properties panel",
                ) + " (Shift+P)",
            onLabelChange: (apply) => i18n.onChange(apply),
        });
        const capabilities = injectedCapabilities ?? createProtocolCapabilities();
        const extraModules = [
            TranslateModule,
            ...(clipboardModules ?? []),
            ...((injectedModules as any[]) ?? []),
        ];
        // Real hosts run the linter themselves and push results, so the default
        // tier is external — keeping VS Code / IntelliJ / Theia byte-identical to
        // today. A consumer (or the demo) can opt into in-page linting by passing
        // an explicit `linting`. The user's in-canvas toggle is relayed to the host
        // as before; the host re-lints and pushes the new state down.
        bpmnModeler = createModeler(canvasEl, {
            propertiesPanelParent,
            extraModules,
            capabilities,
            linting: injectedLinting ?? { results: "external" },
            // A real host activates in-page linting only after it answers the
            // GetBpmnlintConfigCommand with BpmnlintInPageQuery (no workspace
            // config, #1373 Phase B); the webview then pushes its findings back
            // so the host feeds its Problems panel + status bar. `??` keeps the
            // demo's injected sink authoritative when one is supplied.
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
            applyColorThemeMode: setColorThemeMode,
            handleGlobalEscape: true,
        });
        await initializeModeler(bpmnFileQuery?.content, bpmnFileQuery?.engine);
        modelerIsInitialized = true;

        if (pendingFocusId !== undefined) {
            bpmnModeler.viewport.centerOnElement(pendingFocusId);
            pendingFocusId = undefined;
        }

        // The "Edit Script" / divergence bridge now lives entirely in the
        // scripting capability port (InlineScriptingPortForwarder →
        // createProtocolCapabilities), registered by capabilityModules on C7.
        // Only the process-variable publisher stays here because it drives the
        // host from a commandStack subscription rather than a lib-owned event. It
        // belongs to the scripting capability, so gate it on both the engine and
        // the port being present.
        if (bpmnFileQuery?.engine === "c7" && capabilities.scripting) {
            // Publish the process-variable model to the host so open script
            // editors get live variable completion. The chain is a feedback loop,
            // not an echo loop — a keystroke in a script edits the moddle, which
            // fires commandStack.changed, which re-extracts — so it is gated
            // twice: the 300ms debounce collapses per-keystroke bursts, and the
            // JSON compare suppresses re-publishes when the model is unchanged.
            let lastVariablesJson = "";
            const sendVariables = asyncDebounce(async () => {
                const variables = extractProcessVariables(bpmnModeler.getDefinitions());
                const json = JSON.stringify(variables);
                if (json === lastVariablesJson) {
                    return;
                }
                lastVariablesJson = json;
                host.postMessage(new UpdateScriptVariablesCommand(variables));
            }, 300);
            bpmnModeler.onCommandStackChanged(() => void sendVariables());
            // commandStack.changed doesn't fire on import, and a webview reload
            // starts with an empty host-side store, so seed it unconditionally on
            // every load.
            void sendVariables();
        }

        console.debug("[DEBUG] Modeler is initialized...");

        stateManager = new WebviewStateManager(host, bpmnModeler, propertiesPanelParent);

        // Phase 1: restore viewport (canvas exists after openXml). Retried from
        // the observer because hosts mount the webview before laying it out, and
        // the observer then keeps the cached viewbox in sync for the session.
        stateManager.restoreViewport();
        const canvas = bpmnModeler.getService<ResizableCanvas & { getContainer(): Element }>(
            "canvas",
        );
        observeCanvasSize(canvas, canvas.getContainer(), {
            applyInitialViewport: () => stateManager.restoreViewport(),
        });

        // Surface templates bpmn-js rejects (invalid schema, bad `appliesTo`, …).
        // Subscribed *before* GetElementTemplatesCommand so the errors fired
        // while the loader validates the reply are observed. It's a warning, not
        // an error: bpmn-js skips an invalid template non-fatally, and its
        // message already carries the offending template's id/name.
        bpmnModeler.onElementTemplatesErrors((errors) => {
            for (const error of errors ?? []) {
                const message = error instanceof Error ? error.message : String(error);
                host.postMessage(new LogWarningCommand(`Element template rejected: ${message}`));
            }
        });

        // Request templates + settings + panel state, wait for all to apply
        host.postMessage(new GetElementTemplatesCommand());
        host.postMessage(new GetBpmnModelerSettingCommand());
        host.postMessage(new GetPropertiesPanelStateCommand());
        host.postMessage(new GetBpmnlintConfigCommand());

        const [, , panelStateQuery] = await Promise.all([
            elementTemplatesResolver.wait(),
            settingsResolver.wait(),
            panelStateResolver.wait(),
        ]);

        // Apply the host's global properties-panel default. A missing query
        // (unlikely but possible if the resolver was cancelled) falls back to a
        // visible panel so the user is never stranded without properties editing.
        propertiesPanelHandle.setVisible(panelStateQuery?.visible ?? true);

        // Report user toggles back to the host so the global default tracks the
        // latest preference across all BPMN editors.
        propertiesPanelHandle.onVisibilityChanged((visible) => {
            host.postMessage(new SetPropertiesPanelStateCommand(visible));
        });

        // `p` focuses the properties panel (expanding it first if collapsed);
        // `Shift+P` toggles panel visibility from anywhere except text fields.
        // Escape stays with keyboardFocus.ts in BPMN — no escapeToCanvas here.
        installPanelShortcuts({
            handle: propertiesPanelHandle,
            focusCanvas: () => bpmnModeler.getService<{ focus(): void }>("canvas").focus(),
            isCanvasFocused: () =>
                bpmnModeler.getService<{ isFocused(): boolean }>("canvas").isFocused(),
        });

        // Phase 2: restore selection + panel-side UI state (side-effects done)
        stateManager.restoreSelection();
        stateManager.restorePanelUiState();

        // Phase 3: begin persisting changes
        stateManager.startPersisting();
    }

    /**
     * Creates the modeler for the given engine and loads the initial diagram.
     * The container-scoped focus features (Escape guard + focus reticle) and the
     * lint host / theme wiring are composed inside {@link BpmnModeler.create};
     * this function only adds the host-driven bits: editor-action relay, warning
     * sink, and the outbound-sync command-stack subscription.
     *
     * @param bpmn Initial BPMN XML, or `undefined` to create a blank diagram.
     * @param engine Execution platform identifier (`"c7"` or `"c8"`).
     */
    async function initializeModeler(
        bpmn: string | undefined,
        engine: Engine | undefined,
    ): Promise<void> {
        if (!engine) {
            host.postMessage(new LogErrorCommand("ExecutionPlatformVersion undefined!"));
            return;
        }

        try {
            // Async now: the engine-aware step awaits the lazy lint chunk before
            // constructing bpmn-js. A rejection (e.g. UnsupportedEngineError) is
            // caught below exactly as the sync throw was.
            await bpmnModeler.create(engine);
            // Lets the IntelliJ JCEF host drive undo/redo: it swallows
            // Ctrl+Z/Ctrl+Y at the IDE level before bpmn-js sees them (works fine
            // in VS Code/Theia).
            installHostEditorActions((action) =>
                bpmnModeler
                    .getService<{ trigger(action: string): void }>("editorActions")
                    .trigger(action),
            );
            // Forward the modeler's non-fatal warnings (element-not-found,
            // missing inline script) to the output channel — console-only before.
            bpmnModeler.onWarning((warning) => host.postMessage(new LogWarningCommand(warning)));
            bpmnModeler.onCommandStackChanged(() => void debouncedSendXmlChanges());
            await openXml(bpmn);
        } catch (error: any) {
            if (error instanceof NoModelerError) {
                host.postMessage(new LogErrorCommand(error.message));
            } else if (error instanceof UnsupportedEngineError) {
                host.postMessage(new LogErrorCommand(error.message));
            } else {
                host.postMessage(new LogErrorCommand(`Unable to open XML\n${error.message}`));
            }
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
        if (!bpmn) {
            result = await bpmnModeler.newDiagram();
        } else {
            result = await bpmnModeler.loadDiagram(bpmn);
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
            const bpmn = await bpmnModeler.exportDiagram();
            host.postMessage(new SyncDocumentCommand(bpmn));
            bpmnModeler.alignElementsToOrigin();
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
        const errorPrefix = "Error receiving message: " + queryOrCommand.type + " — ";

        switch (true) {
            case queryOrCommand.type === "BpmnFileQuery": {
                try {
                    const bpmnFileQuery = message.data as BpmnFileQuery;
                    if (modelerIsInitialized) {
                        // A host push (e.g. a raw-XML side-by-side edit) is
                        // authoritative. Drop any pending outbound sync first so a
                        // stale export firing after the re-import can't clobber it.
                        debouncedSendXmlChanges.cancel();
                        await debouncedUpdateXML(bpmnFileQuery.content);
                    } else {
                        bpmnFileResolver.done(bpmnFileQuery);
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "ElementTemplatesQuery": {
                try {
                    const elementTemplates = (message.data as ElementTemplatesQuery)
                        .elementTemplates;
                    console.debug("Received element templates: ", elementTemplates);
                    bpmnModeler.setElementTemplates(elementTemplates);
                    elementTemplatesResolver.done(message.data as ElementTemplatesQuery);
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "BpmnlintResultsQuery": {
                try {
                    const query = message.data as BpmnlintResultsQuery;
                    bpmnModeler.applyLintResults(query.results);
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "BpmnLintDisabledQuery": {
                try {
                    bpmnModeler.applyLintingDisabled();
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "BpmnlintInPageQuery": {
                try {
                    const q = message.data as BpmnlintInPageQuery;
                    // The token stays current for the onLintResults echo. Dedup of
                    // a repeat covered instruction now lives in LintConfigService,
                    // where the tier state is known — a stale token from an
                    // intervening disabled push can no longer drop a re-enable.
                    currentLintConfigToken = q.configToken;
                    // No workspace config → engine-aware default (#1373 Phase B);
                    // a covered config (#1384) → lint it in-page. Either way
                    // onLintResults pushes the findings back so the host feeds its
                    // Problems panel + status bar.
                    bpmnModeler.startInPageLinting(q.config, q.configToken);
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "BpmnModelerSettingQuery": {
                try {
                    const setting = (message.data as BpmnModelerSettingQuery).setting;
                    bpmnModeler.setSettings(setting);
                    settingsResolver.done(message.data as BpmnModelerSettingQuery);
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
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
                    i18n.setLanguage(query.locale as SupportedLocale);
                    if (modelerIsInitialized) {
                        await refreshDiagram();
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
                    command.svg = await bpmnModeler.getDiagramSvg();
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
                    const scripts = bpmnModeler.collectInlineScriptTasks();
                    host.postMessage(
                        new OpenScriptEditorsCommand(
                            scripts,
                            extractProcessVariables(bpmnModeler.getDefinitions()),
                        ),
                    );
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "UpdateScriptContentQuery": {
                try {
                    const query = message.data as UpdateScriptContentQuery;
                    bpmnModeler.updateScriptContent(
                        query.elementId,
                        query.kind,
                        query.listenerIndex,
                        query.content,
                    );
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "UpdateScriptFormatQuery": {
                try {
                    const query = message.data as UpdateScriptFormatQuery;
                    bpmnModeler.updateScriptFormat(
                        query.elementId,
                        query.kind,
                        query.listenerIndex,
                        query.scriptFormat,
                    );
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "UpdateOpenScriptEditorsQuery": {
                try {
                    const query = message.data as UpdateOpenScriptEditorsQuery;
                    bpmnModeler.applyOpenScriptEditors(query.openScripts);
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "ImplementationStatusQuery": {
                try {
                    const query = message.data as ImplementationStatusQuery;
                    bpmnModeler.applyImplementationStatus(query.resolved);
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "FocusElementQuery": {
                try {
                    const { elementId } = message.data as FocusElementQuery;
                    if (modelerIsInitialized) {
                        bpmnModeler.viewport.centerOnElement(elementId);
                    } else {
                        pendingFocusId = elementId;
                    }
                } catch (error: any) {
                    host.postMessage(new LogErrorCommand(errorPrefix + error.message));
                }
                break;
            }
            case queryOrCommand.type === "FlushDocumentQuery": {
                // The responder owns its own error handling (replies `undefined`
                // on export failure), so it never throws into this dispatch.
                await respondToFlush(message.data as FlushDocumentQuery);
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
        const xml = await bpmnModeler.exportDiagram();
        const snapshot = stateManager.captureViewState();
        await bpmnModeler.loadDiagram(xml);
        stateManager.applyViewState(snapshot);
    }

    // Best-effort flush of the outbound sync debounce when the webview is hidden
    // (tab switch / close). Reliable in the persistent JCEF host; in VS Code the
    // webview context may be torn down mid-export, so this is a best-effort
    // mitigation of the ≤300ms hide-loss window — the save path is fully covered
    // by the flush protocol instead. Registered per-session (not at import) so a
    // torn-down session leaves no listener behind.
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
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
