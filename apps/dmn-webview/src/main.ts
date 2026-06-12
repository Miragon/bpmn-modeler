// dmn-js
import { DiagramWarning } from "dmn-js/lib/Modeler";
// css
import "./styles.css";
import "dmn-js/dist/assets/diagram-js.css";
import "dmn-js/dist/assets/dmn-js-decision-table.css";
import "dmn-js/dist/assets/dmn-js-decision-table-controls.css";
import "dmn-js/dist/assets/dmn-js-drd.css";
import "dmn-js/dist/assets/dmn-js-literal-expression.css";
import "dmn-js/dist/assets/dmn-js-shared.css";
// The dmn-js icon font (palette tools, context-pad wrench, DRD element icons).
// Unlike the other dmn-js stylesheets it is not pulled in transitively, so it
// must be imported explicitly — otherwise Vite never bundles the `@font-face`
// and every icon renders blank. The `-embedded` variant inlines the font as
// base64, which also sidesteps webview CSP/font-path issues.
import "dmn-js/dist/assets/dmn-font/css/dmn-embedded.css";
import "@bpmn-io/properties-panel/dist/assets/properties-panel.css";

import {
    asyncDebounce,
    Command,
    createResolver,
    DmnFileQuery,
    formatErrors,
    GetDmnFileCommand,
    GetPropertiesPanelStateCommand,
    initResizer,
    LogErrorCommand,
    LogInfoCommand,
    NoModelerError,
    PropertiesPanelStateQuery,
    Query,
    SetPropertiesPanelStateCommand,
    SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";
import { i18n } from "@miragon/bpmn-modeler-i18n";

import {
    createModeler,
    exportDiagram,
    getVsCodeApi,
    loadDiagram,
    onCommandStackChanged,
    WebviewStateManager,
} from "./app";

const vscode = getVsCodeApi();

const stateManager = new WebviewStateManager(vscode);

/**
 * Debounce the openXML function to avoid multiple calls when the user types fast.
 * @param dmn
 * @returns ImportWarning with warnings if any
 * @throws NoModelerError if the modeler is not initialized
 */
const debouncedUpdateXML = asyncDebounce(openXML, 100);

// create resolver to wait for the response from the backend
const dmnFileResolver = createResolver<DmnFileQuery>();
// Resolves once the host replies with the persisted properties-panel default.
const panelStateResolver = createResolver<PropertiesPanelStateQuery>();

let modelerIsInitialized = false;

/**
 * The Main function that gets executed after the webview is fully loaded.
 * This way we can ensure that when the backend sends a message, it is caught.
 * There are two reasons why a webview gets build:
 * 1. A new .dmn file was opened
 * 2. User switched to another tab and now switched back
 */
window.onload = async function () {
    window.addEventListener("message", onReceiveMessage);

    // The resizer's DOM targets (#js-panel-resizer / #js-properties-panel) are
    // pre-rendered by the host, so it can be wired before the modeler mounts.
    // Labels are reused from the BPMN i18n package; DMN has no language wiring
    // yet, so they render the English fallback until that lands.
    const propertiesPanelHandle = initResizer({
        getToggleLabel: (state) =>
            i18n.translate(
                state === "collapsed" ? "Open properties panel" : "Close properties panel",
            ),
        onLabelChange: (apply) => i18n.onChange(apply),
    });

    vscode.postMessage(new GetDmnFileCommand());
    vscode.postMessage(new GetPropertiesPanelStateCommand());
    const dmnFile = await dmnFileResolver.wait();
    await initializeModeler(dmnFile?.content);
    modelerIsInitialized = true;

    // Apply the host's global default, then report user toggles back so the
    // default tracks the latest preference across DMN editors. A missing query
    // falls back to a visible panel so the user is never stranded.
    const panelState = await panelStateResolver.wait();
    propertiesPanelHandle.setVisible(panelState?.visible ?? true);
    propertiesPanelHandle.onVisibilityChanged((visible) => {
        vscode.postMessage(new SetPropertiesPanelStateCommand(visible));
    });

    stateManager.restorePanelUiState();
    stateManager.startPersisting();
};

async function initializeModeler(dmnFile: string | undefined) {
    try {
        createModeler();
        onCommandStackChanged(sendChanges);
        await openXML(dmnFile);
    } catch (error) {
        if (error instanceof NoModelerError) {
            vscode.postMessage(new LogErrorCommand(error.message));
        } else {
            const message = error instanceof Error ? error.message : `${error}`;
            vscode.postMessage(new LogErrorCommand(`Unable to open XML ${message}`));
        }
    }
}

/**
 * Open the given XML content in the modeler.
 * @param dmn
 * @returns ImportWarning with warnings if any
 * @throws NoModelerError if the modeler is not initialized
 */
async function openXML(dmn: string | undefined) {
    if (!dmn) {
        return;
    }

    const result: DiagramWarning = await loadDiagram(dmn);

    if (result.warnings.length > 0) {
        const warnings = result.warnings.map(
            (warning) => `${warning.message}\n${warning.error.message}\n${warning.error.stack}\n`,
        );
        const message = `Diagram was opened with following warnings: ${formatErrors(warnings)}
            `;
        vscode.postMessage(new LogInfoCommand(message));
    }
}

async function sendChanges() {
    const dmn = await exportDiagram();
    vscode.postMessage(new SyncDocumentCommand(dmn));
}

async function onReceiveMessage(message: MessageEvent<Query | Command>) {
    const queryOrCommand = message.data;

    switch (true) {
        case queryOrCommand.type === "DmnFileQuery": {
            try {
                const dmnFileQuery = message.data as DmnFileQuery;
                if (modelerIsInitialized) {
                    await debouncedUpdateXML(dmnFileQuery.content);
                } else {
                    dmnFileResolver.done(dmnFileQuery);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : `${error}`;
                vscode.postMessage(
                    new LogErrorCommand(
                        `Something went wrong when receiving the message ${errorMessage}`,
                    ),
                );
            }
            break;
        }
        case queryOrCommand.type === "PropertiesPanelStateQuery": {
            panelStateResolver.done(message.data as PropertiesPanelStateQuery);
            break;
        }
    }
}
