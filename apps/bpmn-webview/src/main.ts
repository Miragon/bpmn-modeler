// bpmn.js
import { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
// css
import "./styles/default.css";
import "./styles/diff.css";

import {
    asyncDebounce,
    BpmnFileQuery,
    BpmnModelerSettingQuery,
    ClipboardQuery,
    Command,
    createResolver,
    ElementTemplatesQuery,
    formatErrors,
    GetBpmnFileCommand,
    GetBpmnModelerSettingCommand,
    GetClipboardCommand,
    GetDiagramAsSVGCommand,
    GetElementTemplatesCommand,
    GetTextClipboardCommand,
    LanguageQuery,
    LogErrorCommand,
    LogInfoCommand,
    NoModelerError,
    Query,
    SetClipboardCommand,
    SetPropertiesPanelStateCommand,
    SetTextClipboardCommand,
    SyncDocumentCommand,
    TextClipboardQuery,
} from "@bpmn-modeler/shared";
import {
    VsCodeClipboardModule,
    LabelClipboardModule,
} from "@bpmn-modeler/bpmn-clipboard";
import { TranslateModule, i18n, type SupportedLocale } from "@bpmn-modeler/bpmn-i18n";
import {
    BpmnModeler,
    getVsCodeApi,
    initResizer,
    installContentEditableClipboardPolyfill,
    UnsupportedEngineError,
    initTheme,
} from "./app";
import { DiffMode } from "./app/diff/DiffMode";
import { WebviewStateManager } from "./app/state";

const vscode = getVsCodeApi();

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
window.onload = async function () {
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
            vscode.postMessage(new GetClipboardCommand());
            const q = await elementClipboardResolver.wait();
            return q?.text ?? "";
        };
        const writeElementClipboard = (text: string): void => {
            vscode.postMessage(new SetClipboardCommand(text));
        };

        const requestTextClipboard = async (): Promise<string> => {
            textClipboardResolver = createResolver<TextClipboardQuery>();
            vscode.postMessage(new GetTextClipboardCommand());
            const q = await textClipboardResolver.wait();
            return q?.text ?? "";
        };
        const writeTextClipboard = (text: string): void => {
            vscode.postMessage(new SetTextClipboardCommand(text));
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

        // The FEEL editor (CodeMirror 6) in the C8 properties panel lives outside
        // the bpmn-js DI context, so the DI clipboard modules above don't reach it.
        // This polyfill intercepts Cmd/Ctrl+C/V on contenteditable elements and
        // bridges them through the extension host clipboard.
        installContentEditableClipboardPolyfill(
            requestTextClipboard,
            writeTextClipboard,
        );
    }

    vscode.postMessage(new GetBpmnFileCommand());

    const bpmnFileQuery = await bpmnFileResolver.wait();

    // Diff view: host told us this pane is one half of a diff, so bootstrap
    // the readonly DiffMode and skip the editable modeler entirely.
    if (bpmnFileQuery?.viewerMode === "viewer") {
        document.body.classList.add("viewer-mode");
        const canvas = document.getElementById("js-canvas");
        const dropZone = document.getElementById("js-drop-zone");
        if (!canvas || !dropZone) {
            console.error("Diff mode: missing #js-canvas or #js-drop-zone");
            return;
        }
        const diffMode = new DiffMode("#js-canvas", dropZone, vscode);
        await diffMode.startWith(bpmnFileQuery.content);
        return;
    }

    const propertiesPanelHandle = initResizer();
    const extraModules = [TranslateModule, ...(clipboardModules ?? [])];
    await initializeModeler(
        bpmnFileQuery?.content,
        bpmnFileQuery?.engine,
        extraModules,
    );
    modelerIsInitialized = true;

    console.debug("[DEBUG] Modeler is initialized...");

    stateManager = new WebviewStateManager(vscode, bpmnModeler);

    // Phase 1: restore viewport (canvas exists after openXml)
    stateManager.restoreViewport();

    // Request templates + settings, wait for both to apply.  The initial
    // panel visibility is already encoded in the pre-rendered HTML (see
    // `bpmnEditorUi`), so initResizer() seeds its state from the DOM and no
    // separate round-trip is needed.
    vscode.postMessage(new GetElementTemplatesCommand());
    vscode.postMessage(new GetBpmnModelerSettingCommand());

    await Promise.all([elementTemplatesResolver.wait(), settingsResolver.wait()]);

    // Report user toggles back to the host so the global default tracks the
    // latest preference across all BPMN editors.
    propertiesPanelHandle.onVisibilityChanged((visible) => {
        vscode.postMessage(new SetPropertiesPanelStateCommand(visible));
    });

    // Phase 2: restore selection (safe now — side-effects done)
    stateManager.restoreSelection();

    // Phase 3: begin persisting changes
    stateManager.startPersisting();
};

/**
 * Creates the modeler for the given engine and loads the initial diagram.
 *
 * @param bpmn Initial BPMN XML, or `undefined` to create a blank diagram.
 * @param engine Execution platform identifier (`"c7"` or `"c8"`).
 * @param extraModules Optional bpmn-js DI modules (e.g. clipboard bridges).
 */
async function initializeModeler(
    bpmn: string | undefined,
    engine: "c7" | "c8" | undefined,
    extraModules?: any[],
): Promise<void> {
    if (!engine) {
        vscode.postMessage(new LogErrorCommand("ExecutionPlatformVersion undefined!"));
        return;
    }

    try {
        bpmnModeler.create(engine, extraModules);
        bpmnModeler.onCommandStackChanged(sendXmlChanges);
        await openXml(bpmn);
    } catch (error: any) {
        if (error instanceof NoModelerError) {
            vscode.postMessage(new LogErrorCommand(error.message));
        } else if (error instanceof UnsupportedEngineError) {
            vscode.postMessage(new LogErrorCommand(error.message));
        } else {
            vscode.postMessage(
                new LogErrorCommand(`Unable to open XML\n${error.message}`),
            );
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
        const warnings = `with following warnings: ${formatErrors(result.warnings)}`;
        vscode.postMessage(new LogInfoCommand(warnings));
    }
}

/**
 * Exports the current diagram XML and sends it to the backend to persist the
 * changes, then triggers an align-to-origin pass if the setting is enabled.
 */
async function sendXmlChanges(): Promise<void> {
    const bpmn = await bpmnModeler.exportDiagram();
    vscode.postMessage(new SyncDocumentCommand(bpmn));
    bpmnModeler.alignElementsToOrigin();
}

/**
 * Routes incoming messages from the VS Code extension host to the appropriate
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
                vscode.postMessage(new LogErrorCommand(errorPrefix + error.message));
            }
            break;
        }
        case queryOrCommand.type === "ElementTemplatesQuery": {
            try {
                const elementTemplates = (message.data as ElementTemplatesQuery)
                    .elementTemplates;
                console.log("Received element templates: ", elementTemplates);
                bpmnModeler.setElementTemplates(elementTemplates);
                elementTemplatesResolver.done(
                    message.data as ElementTemplatesQuery,
                );
            } catch (error: any) {
                vscode.postMessage(new LogErrorCommand(errorPrefix + error.message));
            }
            break;
        }
        case queryOrCommand.type === "BpmnModelerSettingQuery": {
            try {
                const setting = (message.data as BpmnModelerSettingQuery).setting;
                bpmnModeler.setSettings(setting);
                settingsResolver.done(message.data as BpmnModelerSettingQuery);
            } catch (error: any) {
                vscode.postMessage(new LogErrorCommand(errorPrefix + error.message));
            }
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
                vscode.postMessage(new LogErrorCommand(errorPrefix + error.message));
            }
            break;
        }
        case queryOrCommand.type === "GetDiagramAsSVGCommand": {
            try {
                const command = message.data as GetDiagramAsSVGCommand;
                // Populate the SVG field and echo the command back to the host.
                command.svg = await bpmnModeler.getDiagramSvg();
                vscode.postMessage(command);
            } catch (error: any) {
                vscode.postMessage(new LogErrorCommand(errorPrefix + error.message));
            }
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
