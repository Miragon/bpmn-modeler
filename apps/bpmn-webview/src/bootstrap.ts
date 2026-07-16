// bpmn.js
import { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
// css
import "./styles/default.css";
import "./styles/diff.css";
import "./styles/canvasFocusIndicator.css";

import {
    BpmnFileQuery,
    BpmnlintConfigQuery,
    BpmnModelerSettingQuery,
    ClipboardQuery,
    Command,
    ElementTemplatesQuery,
    Engine,
    GetBpmnFileCommand,
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
    NoModelerError,
    OpenScriptEditorCommand,
    PropertiesPanelStateQuery,
    Query,
    SetClipboardCommand,
    SetPropertiesPanelStateCommand,
    SetTextClipboardCommand,
    SyncDocumentCommand,
    TextClipboardQuery,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
    UpdateScriptVariablesCommand,
    asyncDebounce,
    createResolver,
    extractProcessVariables,
    formatErrors,
    initResizer,
    initTheme,
} from "@miragon/bpmn-modeler-shared";
import { VsCodeClipboardModule, LabelClipboardModule } from "@miragon/bpmn-modeler-clipboard";
import { TranslateModule, i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import {
    BpmnModeler,
    installCanvasFocusIndicator,
    installContentEditableClipboardPolyfill,
    installKeyboardFocus,
    UnsupportedEngineError,
} from "./app";
import type { HostApi } from "@miragon/bpmn-modeler-shared";
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

/**
 * Singleton modeler instance shared across all message handlers.
 * Created during {@link initializeModeler}; `undefined` until then.
 */
const bpmnModeler = new BpmnModeler();

/**
 * Debounce the update of the XML content to avoid too many updates.
 *
 * @param bpmn Latest BPMN XML string received from the backend.
 * @throws {NoModelerError} If the modeler is not available.
 */
const debouncedUpdateXML = asyncDebounce(openXml, 100);

// Create resolver to wait for the response from the backend.
const bpmnFileResolver = createResolver<BpmnFileQuery>();

let modelerIsInitialized = false;

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
    await initializeModeler(bpmnFileQuery?.content, bpmnFileQuery?.engine, extraModules);
    modelerIsInitialized = true;

    /**
     * Bridge "Edit Script" / "Open in Editor" triggers (script-task context
     * pad + listener properties-panel buttons) into a host command so the
     * extension can open the inline script in a virtual VS Code editor.
     * Listeners are wired only on C7; C8 is intentionally out of scope.
     */
    if (bpmnFileQuery?.engine === "c7") {
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

    // Phase 1: restore viewport (canvas exists after openXml)
    stateManager.restoreViewport();

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
        // works even when focus sits in the properties panel or a search field.
        // Services are resolved lazily inside the closures because the modeler
        // exists by the time an Escape can fire.
        installKeyboardFocus({
            focusCanvas: () => bpmnModeler.getService<{ focus(): void }>("canvas").focus(),
            isSearchPadOpen: () =>
                bpmnModeler.getService<{ isOpen(): boolean }>("searchPad").isOpen(),
            closeSearchPad: () => bpmnModeler.getService<{ close(): void }>("searchPad").close(),
        });
        // Playful counterpart to installKeyboardFocus: a focus reticle bottom-left
        // on the canvas that lights up green while the canvas holds keyboard focus
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
        bpmnModeler.onCommandStackChanged(sendXmlChanges);
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
 */
async function sendXmlChanges(): Promise<void> {
    // A rejection here only reaches the global unhandledrejection hook (diagram-js
    // discards the returned promise) as a context-free line — catch it so the
    // failure is named and deterministic on the channel.
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
                const elementTemplates = (message.data as ElementTemplatesQuery).elementTemplates;
                console.debug("Received element templates: ", elementTemplates);
                bpmnModeler.setElementTemplates(elementTemplates);
                elementTemplatesResolver.done(message.data as ElementTemplatesQuery);
            } catch (error: any) {
                host.postMessage(new LogErrorCommand(errorPrefix + error.message));
            }
            break;
        }
        case queryOrCommand.type === "BpmnlintConfigQuery": {
            try {
                const query = message.data as BpmnlintConfigQuery;
                const warnings = bpmnModeler
                    .getService<LintConfigService>("bpmnLintConfig")
                    .apply(query.config);

                for (const warning of warnings) {
                    host.postMessage(new LogWarningCommand(warning));
                }
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
        case queryOrCommand.type === "ImplementationStatusQuery": {
            try {
                const query = message.data as ImplementationStatusQuery;
                bpmnModeler.applyImplementationStatus(query.resolved);
            } catch (error: any) {
                host.postMessage(new LogErrorCommand(errorPrefix + error.message));
            }
            break;
        }
    }
}

/**
 * Re-renders the diagram by exporting and re-importing the XML.
 *
 * Preserves the current viewport (position and zoom) so the user does not
 * lose their place.  Used after a language switch to force bpmn-js to
 * re-invoke `translate()` for all UI elements.
 */
async function refreshDiagram(): Promise<void> {
    const xml = await bpmnModeler.exportDiagram();
    const viewport = bpmnModeler.viewport.getViewport();
    await bpmnModeler.loadDiagram(xml);
    bpmnModeler.viewport.setViewport(viewport);
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
