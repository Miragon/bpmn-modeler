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
import "@bpmn-io/properties-panel/dist/assets/properties-panel.css";

import {
    asyncDebounce,
    Command,
    createResolver,
    DmnFileQuery,
    formatErrors,
    GetDmnFileCommand,
    LogErrorCommand,
    LogInfoCommand,
    NoModelerError,
    Query,
    SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";

import {
    createModeler,
    exportDiagram,
    getVsCodeApi,
    loadDiagram,
    onCommandStackChanged,
} from "./app";

const vscode = getVsCodeApi();

/**
 * Debounce the openXML function to avoid multiple calls when the user types fast.
 * @param dmn
 * @returns ImportWarning with warnings if any
 * @throws NoModelerError if the modeler is not initialized
 */
const debouncedUpdateXML = asyncDebounce(openXML, 100);

// create resolver to wait for the response from the backend
const dmnFileResolver = createResolver<DmnFileQuery>();

/**
 * The Main function that gets executed after the webview is fully loaded.
 * This way we can ensure that when the backend sends a message, it is caught.
 * There are two reasons why a webview gets build:
 * 1. A new .dmn file was opened
 * 2. User switched to another tab and now switched back
 */
window.onload = async function () {
    window.addEventListener("message", onReceiveMessage);

    vscode.postMessage(new GetDmnFileCommand());
    const dmnFile = await dmnFileResolver.wait();
    await initializeModeler(dmnFile?.content);
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
                await debouncedUpdateXML(dmnFileQuery.content);
            } catch (error) {
                if (error instanceof NoModelerError) {
                    dmnFileResolver.done(message.data as DmnFileQuery);
                } else {
                    const errorMessage = error instanceof Error ? error.message : `${error}`;
                    vscode.postMessage(
                        new LogErrorCommand(
                            `Something went wrong when receiving the message ${errorMessage}`,
                        ),
                    );
                }
            }
            break;
        }
    }
}
