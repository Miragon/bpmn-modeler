// bpmn.js
import { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
// css
import "./styles/default.css";

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
    LogErrorCommand,
    LogInfoCommand,
    NoModelerError,
    Query,
    SetClipboardCommand,
    SetTextClipboardCommand,
    SyncDocumentCommand,
    TextClipboardQuery,
} from "@bpmn-modeler/shared";
import {
    VsCodeClipboardModule,
    LabelClipboardModule,
} from "@bpmn-modeler/bpmn-clipboard";
import {
    BpmnModeler,
    getVsCodeApi,
    initResizer,
    installContentEditableClipboardPolyfill,
    UnsupportedEngineError,
} from "./app";

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
    initResizer();
    bpmnModeler.initTheme();

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
    await initializeModeler(
        bpmnFileQuery?.content,
        bpmnFileQuery?.engine,
        clipboardModules,
    );
    modelerIsInitialized = true;

    console.debug("[DEBUG] Modeler is initialized...");

    vscode.postMessage(new GetElementTemplatesCommand());
    vscode.postMessage(new GetBpmnModelerSettingCommand());
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

        // Restore the saved viewport if one exists (e.g. after a tab switch).
        // Must run after openXml because the canvas does not exist before importXML.
        try {
            const saved = vscode.getState().viewport;
            if (saved) {
                bpmnModeler.setViewport(saved);
            }
        } catch {
            // No state yet — first open, leave viewport at diagram-js default.
        }

        // Persist viewport changes so they survive the next tab switch.
        bpmnModeler.onViewportChanged((viewport) => {
            try {
                vscode.updateState({ viewport });
            } catch {
                vscode.setState({ viewport });
            }
        });
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
                bpmnModeler.setElementTemplates(elementTemplates);
            } catch (error: any) {
                vscode.postMessage(new LogErrorCommand(errorPrefix + error.message));
            }
            break;
        }
        case queryOrCommand.type === "BpmnModelerSettingQuery": {
            try {
                const setting = (message.data as BpmnModelerSettingQuery).setting;
                bpmnModeler.setSettings(setting);
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
