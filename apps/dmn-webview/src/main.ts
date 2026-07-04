// dmn-js
import { DiagramWarning } from "dmn-js/lib/Modeler";
// css — base layout only; the swappable dmn-js stylesheets (light/dark) load
// through the `#theme-link` element rather than being bundled here.
import "./styles.css";

import {
    asyncDebounce,
    Command,
    createResolver,
    DmnFileQuery,
    DmnModelerSettingQuery,
    formatErrors,
    GetDmnFileCommand,
    GetDmnModelerSettingCommand,
    GetPropertiesPanelStateCommand,
    initResizer,
    initTheme,
    LogErrorCommand,
    LogWarningCommand,
    NoModelerError,
    PropertiesPanelStateQuery,
    Query,
    setColorThemeMode,
    SetPropertiesPanelStateCommand,
    SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";
import { i18n } from "@miragon/bpmn-modeler-i18n";

import {
    createModeler,
    exportDiagram,
    getHostApi,
    loadDiagram,
    onCommandStackChanged,
    WebviewStateManager,
} from "./app";

const host = getHostApi();

// Global safety net for throws outside the per-message try/catch below — dmn-js
// event-bus callbacks run outside it, so an error there would otherwise vanish
// into the webview console instead of reaching the output channel.
window.addEventListener("error", (event: ErrorEvent) => {
    host.postMessage(new LogErrorCommand(`Unhandled error: ${event.message}`, event.error?.stack));
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

const stateManager = new WebviewStateManager(host);

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
// Resolves once the host replies with the current color-theme preference.
const settingsResolver = createResolver<DmnModelerSettingQuery>();

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

    // Follow the VS Code theme immediately; the host's `colorTheme` preference
    // (which may force light) is applied once the setting query arrives below.
    initTheme();

    // Labels reuse the BPMN i18n keys; DMN has no language wiring yet, so they
    // render the English fallback until that lands.
    const propertiesPanelHandle = initResizer({
        getToggleLabel: (state) =>
            i18n.translate(
                state === "collapsed" ? "Open properties panel" : "Close properties panel",
            ),
        onLabelChange: (apply) => i18n.onChange(apply),
    });

    host.postMessage(new GetDmnFileCommand());
    host.postMessage(new GetPropertiesPanelStateCommand());
    host.postMessage(new GetDmnModelerSettingCommand());
    const dmnFile = await dmnFileResolver.wait();
    await initializeModeler(dmnFile?.content);
    modelerIsInitialized = true;

    // Block until the host's color-theme preference has been applied (the
    // handler in onReceiveMessage swaps the stylesheet) so the modeler doesn't
    // settle on the wrong theme before the user setting arrives.
    await settingsResolver.wait();

    // Apply the host's global default, then report toggles back to persist it.
    const panelState = await panelStateResolver.wait();
    propertiesPanelHandle.setVisible(panelState?.visible ?? true);
    propertiesPanelHandle.onVisibilityChanged((visible) => {
        host.postMessage(new SetPropertiesPanelStateCommand(visible));
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
            host.postMessage(new LogErrorCommand(error.message));
        } else {
            const message = error instanceof Error ? error.message : `${error}`;
            host.postMessage(new LogErrorCommand(`Unable to open XML ${message}`));
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
        host.postMessage(new LogWarningCommand(message));
    }
}

async function sendChanges() {
    const dmn = await exportDiagram();
    host.postMessage(new SyncDocumentCommand(dmn));
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
                host.postMessage(
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
        case queryOrCommand.type === "DmnModelerSettingQuery": {
            // Applied live so a VS Code theme change in `"automatic"` mode
            // re-themes an already-open editor, not just on first load.
            const settingQuery = message.data as DmnModelerSettingQuery;
            setColorThemeMode(settingQuery.setting.colorTheme);
            settingsResolver.done(settingQuery);
            break;
        }
    }
}
