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
    Engine,
    FlushDocumentQuery,
    FocusElementQuery,
    FormReferenceStatusQuery,
    GetBpmnFileCommand,
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
    NoModelerError,
    OpenScriptEditorCommand,
    OpenScriptEditorsCommand,
    PropertiesPanelStateQuery,
    Query,
    ReleaseDocumentFlushQuery,
    SetClipboardCommand,
    SetPropertiesPanelStateCommand,
    SetTextClipboardCommand,
    SyncDocumentCommand,
    TextClipboardQuery,
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
    UpdateScriptSourceCommand,
    UpdateScriptVariablesCommand,
    asyncDebounce,
    createFlushResponder,
    createResolver,
    extractProcessVariables,
    formatErrors,
    initResizer,
    initTheme,
    observeCanvasSize,
    serializeAsync,
} from "@miragon/bpmn-modeler-shared";
import { VsCodeClipboardModule, LabelClipboardModule } from "@miragon/bpmn-modeler-clipboard";
import { TranslateModule, i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";
import {
    BpmnModeler,
    installCanvasFocusIndicator,
    installContentEditableClipboardPolyfill,
    installKeyboardFocus,
    UnsupportedEngineError,
} from "./app";
import type { HostApi, ResizableCanvas } from "@miragon/bpmn-modeler-shared";
import type { WebviewState } from "./app/webviewState";
import { DiffMode } from "./app/diff/DiffMode";
import type { LintConfigService } from "./app/bpmnlint";
import { installHostEditorActions } from "./app/hostEditorActions";
import { WebviewStateManager } from "./app/state";

// Injected by bootstrap(); the app/demo entry chooses the concrete host.
let host: HostApi<WebviewState, Command | Query>;
let injectedModules: unknown[] | undefined;

// Global safety net for throws the per-message try/catch in onReceiveMessage
// can't reach — bpmn-js event-bus callbacks (e.g. onCommandStackChanged) run
// outside it, so an error there would otherwise vanish into the webview console
// and never reach the output channel.
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

// Best-effort flush of the outbound sync debounce when the webview is hidden
// (tab switch / close). Reliable in the persistent JCEF host; in VS Code the
// webview context may be torn down mid-export, so this is a best-effort mitigation
// of the ≤300ms hide-loss window — the save path is fully covered by the flush
// protocol instead.
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        void debouncedSendXmlChanges.flush();
        stateManager?.flushViewport();
    }
});

/**
 * Singleton modeler instance shared across all message handlers.
 * Created during {@link initializeModeler}; `undefined` until then.
 */
const bpmnModeler = new BpmnModeler();

/**
 * Re-imports the XML while preserving the user's drill-down plane,
 * viewbox, and selection. The snapshot is taken from the live canvas
 * inside the debounced function so a burst of host pushes captures
 * once, not from a half-imported intermediate.
 */
async function reloadXmlPreservingView(
    bpmn: string | undefined,
    documentRevision: number,
): Promise<void> {
    const snapshot = stateManager?.captureViewState();
    await openHostXml(bpmn, documentRevision);
    if (snapshot) {
        stateManager.applyViewState(snapshot);
    }
}

/**
 * Debounce the update of the XML content to avoid too many updates.
 *
 * @param bpmn Latest BPMN XML string received from the backend.
 * @throws {NoModelerError} If the modeler is not available.
 */
const serializedOpenXml = serializeAsync(reloadXmlPreservingView);
const debouncedUpdateXML = asyncDebounce(serializedOpenXml, 100);

/**
 * Debounces the outbound document sync so a burst of model changes (e.g.
 * properties-panel typing) collapses into one full export + host write instead
 * of one per keystroke. `maxWait` bounds starvation: sustained typing still
 * syncs at least once per second. 300ms/1000ms mirrors the script-streaming
 * debounce above. The host recovers the sub-300ms tail via the flush protocol
 * ({@link respondToFlush}) so a save never persists stale XML.
 */
const debouncedSendXmlChanges = asyncDebounce(sendXmlChanges, 300, { maxWait: 1000 });

let inertBeforeDestructiveFlush: boolean | undefined;
let hostUpdateVersion = 0;
let hostDocumentRevision = 0;
let latestHostDocumentRevision = 0;
let initialBpmnFileReceived = false;
let initialViewerMode = false;
let latestBpmnFileQuery: BpmnFileQuery | undefined;

async function flushPendingXmlChanges(): Promise<void> {
    while (debouncedSendXmlChanges.pending()) {
        await debouncedSendXmlChanges.flush();
    }
}

async function flushPendingHostUpdates(): Promise<void> {
    while (debouncedUpdateXML.pending()) {
        try {
            await debouncedUpdateXML.flush();
        } catch {
            // The message handler reports the import error; keep draining so a
            // later valid host update can still complete bootstrap.
        }
    }
}

/**
 * Answers a host {@link FlushDocumentQuery} on the save/close path: exports and
 * returns the pending XML (or reports nothing-pending). The `pending()` gate and
 * normal-sync fallback rationale live in {@link createFlushResponder}.
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
            document.body.inert = inertBeforeDestructiveFlush;
            inertBeforeDestructiveFlush = undefined;
        },
        exportContent: () => bpmnModeler.exportDiagram(),
    },
    (reply) => host.postMessage(reply),
);

// Create resolver to wait for the response from the backend.
const bpmnFileResolver = createResolver<BpmnFileQuery>();

let modelerIsInitialized = false;

// A FocusElementQuery can arrive before the import finishes (host opens the
// editor and focuses in one tick); apply it once the modeler is ready.
let pendingFocusId: string | undefined;

// Separate resolvers for element clipboard and text (label) clipboard.
let elementClipboardResolver = createResolver<ClipboardQuery>();
let textClipboardResolver = createResolver<TextClipboardQuery>();

// Resolvers that signal when element templates and settings have been applied.
// Selection restore is deferred until both complete so that side-effects
// (e.g. transaction-boundary rendering) do not clear the restored selection.
const elementTemplatesResolver = createResolver<ElementTemplatesQuery>();
const settingsResolver = createResolver<BpmnModelerSettingQuery>();

// Resolves once the host has replied with the global properties-panel default.
// The webview uses this value only when its own webview state has no
// panelVisible entry — see WebviewStateManager.restorePanelVisibility.
const panelStateResolver = createResolver<PropertiesPanelStateQuery>();

/**
 * State manager for persisting and restoring viewport/selection across tab switches.
 * Initialised after the modeler is created.
 */
let stateManager: WebviewStateManager;

/**
 * Entry point executed once the webview DOM is fully loaded.
 *
 * Registers the message listener first so no backend messages are missed,
 * then requests the BPMN file and waits for the reply before creating the
 * modeler.  After the modeler is ready, secondary resources (element
 * templates, settings) are requested.
 *
 * There are two reasons the webview is built:
 * 1. A new `.bpmn` file was opened.
 * 2. The user switched away and back to the tab.
 */
async function run(): Promise<void> {
    window.addEventListener("message", onReceiveMessage);

    // Merge the modeler's Camunda-7 / dmn-js / internal strings onto the shared
    // library's dictionaries before anything translates. The shared package is
    // C8-seeded and lacks these keys; without this bridge they would render as
    // English. extend() persists across setLanguage(), so this single call at
    // startup covers every later language switch and both the modeler and the
    // viewer-mode diff legend below.
    i18n.extend(i18nExtras);

    initTheme();

    // Viewer mode (one side of a diff view) skips the resizer + properties
    // panel + palette, so we don't call initResizer() here — the chrome is
    // hidden by .viewer-mode CSS once we confirm the mode below.  For the
    // modeler path, initResizer() is called after the branch check.

    // Build clipboard DI modules conditionally.
    // In development (plain browser) NativeCopyPaste handles clipboard natively.
    let clipboardModules: any[] | undefined;

    if (process.env.NODE_ENV !== "development") {
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

        clipboardModules = [
            VsCodeClipboardModule,
            LabelClipboardModule,
            {
                elementClipboardBridge: [
                    "value",
                    {
                        requestClipboard: requestElementClipboard,
                        writeClipboard: writeElementClipboard,
                    },
                ],
                textClipboardBridge: [
                    "value",
                    {
                        requestClipboard: requestTextClipboard,
                        writeClipboard: writeTextClipboard,
                    },
                ],
            },
        ];

        /**
         * The FEEL editor (CodeMirror 6) in the C8 properties panel lives outside
         * the bpmn-js DI context, so the DI clipboard modules above don't reach it.
         * This polyfill intercepts Cmd/Ctrl+C/V on contenteditable elements and
         * bridges them through the extension host clipboard, and guards Ctrl+A
         * in text-editing surfaces from being stolen by bpmn-js's Keyboard
         * service (canvas Ctrl+A is owned by bpmn-js's SelectionKeyBindings).
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

    const propertiesPanelHandle = initResizer({
        getToggleLabel: (state) =>
            i18n.translate(
                state === "collapsed" ? "Open properties panel" : "Close properties panel",
            ),
        onLabelChange: (apply) => i18n.onChange(apply),
    });
    const vsCodeBridgeModule = {
        vsCodeBridge: ["value", { postMessage: (m: unknown) => host.postMessage(m as never) }],
    };
    const extraModules = [
        TranslateModule,
        vsCodeBridgeModule,
        ...(clipboardModules ?? []),
        ...((injectedModules as any[]) ?? []),
    ];
    await initializeModeler(
        bpmnFileQuery?.content,
        bpmnFileQuery?.engine,
        extraModules,
        bpmnFileQuery?.documentRevision,
    );
    await flushPendingHostUpdates();
    modelerIsInitialized = true;

    const currentBpmnFileQuery = latestBpmnFileQuery ?? bpmnFileQuery;

    if (currentBpmnFileQuery?.engine === "c8") {
        host.postMessage(new GetFormReferenceStatusCommand());
    }

    if (pendingFocusId !== undefined) {
        bpmnModeler.viewport.centerOnElement(pendingFocusId);
        pendingFocusId = undefined;
    }

    /**
     * Bridge "Edit Script" / "Open in Editor" triggers (script-task context
     * pad + listener properties-panel buttons) into a host command so the
     * extension can open the inline script in a virtual VS Code editor.
     * Listeners are wired only on C7; C8 is intentionally out of scope.
     */
    if (currentBpmnFileQuery?.engine === "c7") {
        bpmnModeler.onOpenScriptEditor((data) => {
            host.postMessage(
                new OpenScriptEditorCommand(
                    data.elementId,
                    data.kind,
                    data.listenerIndex,
                    data.eventName,
                    data.scriptFormat,
                    data.content,
                    extractProcessVariables(bpmnModeler.getDefinitions()),
                ),
            );
        });

        // Model-side script changes (canvas undo/redo, document reload,
        // element deletion) must reach the host so it can overwrite — or
        // close — the owning editor tab; see ScriptSourceWatcher.
        bpmnModeler.onScriptSourceChanged((data) => {
            host.postMessage(
                new UpdateScriptSourceCommand(
                    data.elementId,
                    data.kind,
                    data.listenerIndex,
                    data.content,
                ),
            );
        });

        // Publish the process-variable model to the host so open script editors
        // get live variable completion. The chain is a feedback loop, not an echo
        // loop — a keystroke in a script edits the moddle, which fires
        // commandStack.changed, which re-extracts — so it is gated twice: the
        // 300ms debounce collapses per-keystroke bursts, and the JSON compare
        // suppresses re-publishes when the extracted model is unchanged.
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
        // commandStack.changed doesn't fire on import, and a webview reload starts
        // with an empty host-side store, so seed it unconditionally on every load.
        void sendVariables();
    }

    console.debug("[DEBUG] Modeler is initialized...");

    stateManager = new WebviewStateManager(host, bpmnModeler);

    // Phase 1: restore viewport (canvas exists after openXml). Retried from the
    // observer because hosts mount the webview before laying it out, and the
    // observer then keeps the cached viewbox in sync for the rest of the session.
    stateManager.restoreViewport();
    const canvas = bpmnModeler.getService<ResizableCanvas & { getContainer(): Element }>("canvas");
    observeCanvasSize(canvas, canvas.getContainer(), {
        applyInitialViewport: () => stateManager.restoreViewport(),
    });

    // Surface templates bpmn-js rejects (invalid schema, bad `appliesTo`, …).
    // Subscribed *before* GetElementTemplatesCommand so the errors fired while
    // the loader validates the reply are observed. It's a warning, not an error:
    // bpmn-js skips an invalid template non-fatally, and its message already
    // carries the offending template's id/name.
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

    // Apply the host's global properties-panel default.  A missing query
    // (unlikely but possible if the resolver was cancelled) falls back to a
    // visible panel so the user is never stranded without properties editing.
    propertiesPanelHandle.setVisible(panelStateQuery?.visible ?? true);

    // Report user toggles back to the host so the global default tracks the
    // latest preference across all BPMN editors.
    propertiesPanelHandle.onVisibilityChanged((visible) => {
        host.postMessage(new SetPropertiesPanelStateCommand(visible));
    });

    // Phase 2: restore selection + panel-side UI state (safe now — side-effects done)
    stateManager.restoreSelection();
    stateManager.restorePanelUiState();

    // Phase 3: begin persisting changes
    stateManager.startPersisting();
}

/**
 * Creates the modeler for the given engine and loads the initial diagram.
 *
 * @param bpmn Initial BPMN XML, or `undefined` to create a blank diagram.
 * @param engine Execution platform identifier (`"c7"` or `"c8"`).
 * @param extraModules Optional bpmn-js DI modules (e.g. clipboard bridges).
 */
async function initializeModeler(
    bpmn: string | undefined,
    engine: Engine | undefined,
    extraModules?: any[],
    documentRevision = 0,
): Promise<void> {
    if (!engine) {
        host.postMessage(new LogErrorCommand("ExecutionPlatformVersion undefined!"));
        return;
    }

    try {
        bpmnModeler.create(engine, extraModules);
        // Lets the IntelliJ JCEF host drive undo/redo: it swallows Ctrl+Z/Ctrl+Y
        // at the IDE level before bpmn-js sees them (works fine in VS Code/Theia).
        installHostEditorActions((action) =>
            bpmnModeler
                .getService<{ trigger(action: string): void }>("editorActions")
                .trigger(action),
        );
        // Escape re-homes focus on the canvas so keyboard-driven modelling
        // (A/N/arrows, all owned by bpmn-js's canvas-scoped Keyboard service)
        // works even when focus sits in the properties panel or a search field;
        // a further Escape on the focused canvas clears the selection.
        // Services are resolved lazily inside the closures because the modeler
        // exists by the time an Escape can fire.
        installKeyboardFocus({
            focusCanvas: () => bpmnModeler.getService<{ focus(): void }>("canvas").focus(),
            isCanvasFocused: () =>
                bpmnModeler.getService<{ isFocused(): boolean }>("canvas").isFocused(),
            hasSelection: () =>
                bpmnModeler.getService<{ get(): unknown[] }>("selection").get().length > 0,
            clearSelection: () =>
                bpmnModeler.getService<{ select(elements: null): void }>("selection").select(null),
            isSearchPadOpen: () =>
                bpmnModeler.getService<{ isOpen(): boolean }>("searchPad").isOpen(),
            closeSearchPad: () => bpmnModeler.getService<{ close(): void }>("searchPad").close(),
        });
        // Playful counterpart to installKeyboardFocus: a focus reticle in the
        // canvas's top-right corner, beside the "Open minimap" control, that
        // lights up green while the canvas holds keyboard focus
        // with no element selected (a selection already marks itself).
        // diagram-js already tracks the focus half (Canvas fires a deduplicated
        // "canvas.focus.changed" from its own SVG focus listeners), so subscribe
        // instead of re-observing DOM focus — a container-level focusin would
        // false-positive on the lint chip inside the same .djs-container.
        installCanvasFocusIndicator({
            parent: bpmnModeler
                .getService<{ getContainer(): HTMLElement }>("canvas")
                .getContainer(),
            isFocused: () => bpmnModeler.getService<{ isFocused(): boolean }>("canvas").isFocused(),
            onFocusChanged: (listener) =>
                bpmnModeler
                    .getService<{
                        on(event: string, cb: (e: { focused: boolean }) => void): void;
                    }>("eventBus")
                    .on("canvas.focus.changed", (e) => listener(e.focused)),
            hasSelection: () =>
                bpmnModeler.getService<{ get(): unknown[] }>("selection").get().length > 0,
            onSelectionChanged: (listener) =>
                bpmnModeler
                    .getService<{
                        on(event: string, cb: (e: { newSelection: unknown[] }) => void): void;
                    }>("eventBus")
                    .on("selection.changed", (e) => listener(e.newSelection.length > 0)),
        });
        // Forward the modeler's non-fatal warnings (element-not-found, missing
        // inline script) to the output channel — they were console-only before.
        bpmnModeler.onWarning((warning) => host.postMessage(new LogWarningCommand(warning)));
        bpmnModeler.onCommandStackChanged(() => void debouncedSendXmlChanges());
        await serializedOpenXml(bpmn, documentRevision);
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

async function openHostXml(bpmn: string | undefined, documentRevision: number): Promise<void> {
    await openXml(bpmn);
    if (documentRevision === latestHostDocumentRevision) {
        hostDocumentRevision = documentRevision;
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
    // A rejection here only reaches the global unhandledrejection hook (diagram-js
    // discards the returned promise) as a context-free line — catch it so the
    // failure is named and deterministic on the channel.
    try {
        const version = hostUpdateVersion;
        const bpmn = await bpmnModeler.exportDiagram();
        if (version !== hostUpdateVersion || debouncedUpdateXML.pending()) return;
        host.postMessage(new SyncDocumentCommand(bpmn, hostDocumentRevision));
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
                    await debouncedUpdateXML(bpmnFileQuery.content, documentRevision);
                }
            } catch (error: any) {
                host.postMessage(new LogErrorCommand(errorPrefix + error.message));
            }
            break;
        }
        case queryOrCommand.type === "ElementTemplatesQuery": {
            try {
                const elementTemplates = (message.data as ElementTemplatesQuery).elementTemplates;
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
                bpmnModeler.getService<LintConfigService>("bpmnLintConfig").render(query.results);
            } catch (error: any) {
                host.postMessage(new LogErrorCommand(errorPrefix + error.message));
            }
            break;
        }
        case queryOrCommand.type === "BpmnLintDisabledQuery": {
            try {
                bpmnModeler.getService<LintConfigService>("bpmnLintConfig").renderDisabled();
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
                // sequentially; the variable model is identical for every script
                // in the diagram, so it is extracted once and shared.
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
        case queryOrCommand.type === "FormReferenceStatusQuery": {
            try {
                const query = message.data as FormReferenceStatusQuery;
                bpmnModeler.applyFormReferenceStatus(query.formIds);
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
        case ["FlushDocumentQuery", "ReleaseDocumentFlushQuery"].includes(queryOrCommand.type): {
            await respondToFlush(message.data as FlushDocumentQuery | ReleaseDocumentFlushQuery);
            break;
        }
    }
}

/**
 * Re-renders the diagram by exporting and re-importing the XML.
 *
 * Preserves the current drill-down plane, viewport, and selection so the
 * user does not lose their place.  Used after a language switch to force
 * bpmn-js to re-invoke `translate()` for all UI elements.
 */
async function refreshDiagram(): Promise<void> {
    const xml = await bpmnModeler.exportDiagram();
    const snapshot = stateManager.captureViewState();
    await bpmnModeler.loadDiagram(xml);
    stateManager.applyViewState(snapshot);
}

/**
 * Starts the BPMN webview against the given host. The entry (real or demo)
 * chooses the host and any host-specific bpmn-js modules.
 */
export function bootstrap(
    injectedHost: HostApi<WebviewState, Command | Query>,
    opts: { extraModules?: unknown[] } = {},
): void {
    host = injectedHost;
    injectedModules = opts.extraModules;
    registerGlobalErrorHandlers();
    if (document.readyState === "complete") {
        void run();
    } else {
        window.addEventListener("load", () => void run());
    }
}
