// dmn-js
import { DiagramWarning } from "dmn-js/lib/Modeler";
// css — base layout only; the swappable dmn-js stylesheets (light/dark) load
// through the `#theme-link` element rather than being bundled here.
import "./styles.css";

import {
    asyncDebounce,
    Command,
    createFlushResponder,
    createResolver,
    DmnFileQuery,
    DmnModelerSettingQuery,
    FlushDocumentQuery,
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
    ReleaseDocumentFlushQuery,
    serializeAsync,
    setColorThemeMode,
    SetPropertiesPanelStateCommand,
    SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";
import { i18n } from "@miragon/bpmn-modeler-i18n";

import {
    createModeler,
    exportDiagram,
    loadDiagram,
    onCommandStackChanged,
    syncCanvasSize,
    WebviewStateManager,
} from "./app";
import type { HostApi } from "@miragon/bpmn-modeler-shared";
import type { WebviewState } from "./app/host";

// Injected by bootstrap(); the app/demo entry chooses the concrete host.
let host: HostApi<WebviewState, Command | Query>;

// Global safety net for throws outside the per-message try/catch below — dmn-js
// event-bus callbacks run outside it, so an error there would otherwise vanish
// into the webview console instead of reaching the output channel.
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
 * Debounce the openXML function to avoid multiple calls when the user types fast.
 * @param dmn
 * @returns ImportWarning with warnings if any
 * @throws NoModelerError if the modeler is not initialized
 */
const serializedOpenXML = serializeAsync(openHostXML);
const debouncedUpdateXML = asyncDebounce(serializedOpenXML, 100);

// Best-effort flush of the outbound sync debounce when the webview is hidden
// (tab switch / close). Reliable in the persistent JCEF host; in VS Code the
// webview context may die mid-export, so this only mitigates the ≤300ms
// hide-loss window — the save path is fully covered by the flush protocol.
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        void debouncedSendChanges.flush();
    }
});

/**
 * Debounces the outbound document sync so a burst of model changes (e.g.
 * decision-table typing) collapses into one full export + host write instead of
 * one per keystroke. `maxWait` bounds starvation: sustained typing still syncs
 * at least once per second. The host recovers the sub-300ms tail via the flush
 * protocol ({@link respondToFlush}) so a save never persists stale XML.
 *
 * dmn-js rebinds `commandStack.changed` per view switch and stacks duplicate
 * listeners; the debounce coalescing those duplicates is a strict improvement.
 */
const debouncedSendChanges = asyncDebounce(sendChanges, 300, { maxWait: 1000 });

let inertBeforeDestructiveFlush: boolean | undefined;
let hostUpdateVersion = 0;
let hostDocumentRevision = 0;
let latestHostDocumentRevision = 0;
let initialDmnFileReceived = false;

async function flushPendingChanges(): Promise<void> {
    while (debouncedSendChanges.pending()) {
        await debouncedSendChanges.flush();
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
 * Answers a host {@link FlushDocumentQuery} on the save/close path. Before the
 * first diagram loads `exportDiagram()` throws, so the responder leaves the
 * request unconfirmed. Rationale for the gate lives in {@link createFlushResponder}.
 */
const respondToFlush = createFlushResponder(
    {
        isReady: () => modelerIsInitialized,
        hasPendingSync: () => debouncedSendChanges.pending(),
        hasPendingHostUpdate: () => debouncedUpdateXML.pending(),
        hostUpdateVersion: () => hostUpdateVersion,
        documentRevision: () => hostDocumentRevision,
        flushPendingSync: flushPendingChanges,
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
        exportContent: () => exportDiagram(),
    },
    (reply) => host.postMessage(reply),
);

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
async function run(): Promise<void> {
    const stateManager = new WebviewStateManager(host);
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
    await initializeModeler(dmnFile?.content, dmnFile?.documentRevision);
    await flushPendingHostUpdates();
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
}

async function initializeModeler(dmnFile: string | undefined, documentRevision = 0) {
    try {
        createModeler();
        onCommandStackChanged(() => void debouncedSendChanges());
        const canvasElement = document.querySelector("#js-canvas");
        if (canvasElement) {
            syncCanvasSize(canvasElement);
        }
        await serializedOpenXML(dmnFile, documentRevision);
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

async function openHostXML(dmn: string | undefined, documentRevision: number): Promise<void> {
    await openXML(dmn);
    if (documentRevision === latestHostDocumentRevision) {
        hostDocumentRevision = documentRevision;
    }
}

async function sendChanges() {
    // A rejection here only reaches the global unhandledrejection hook (the
    // dmn-js event bus discards the returned promise) as a context-free line —
    // catch it so the failure is named and deterministic on the channel.
    try {
        const version = hostUpdateVersion;
        const dmn = await exportDiagram();
        if (version !== hostUpdateVersion || debouncedUpdateXML.pending()) return;
        host.postMessage(new SyncDocumentCommand(dmn, hostDocumentRevision));
    } catch (error) {
        const e = error instanceof Error ? error : new Error(String(error));
        host.postMessage(
            new LogErrorCommand(`Failed to sync diagram changes: ${e.message}`, e.stack),
        );
    }
}

async function onReceiveMessage(message: MessageEvent<Query | Command>) {
    const queryOrCommand = message.data;

    switch (true) {
        case queryOrCommand.type === "DmnFileQuery": {
            try {
                const dmnFileQuery = message.data as DmnFileQuery;
                const documentRevision = dmnFileQuery.documentRevision ?? 0;
                if (documentRevision < latestHostDocumentRevision) break;
                latestHostDocumentRevision = documentRevision;
                hostUpdateVersion++;
                if (!initialDmnFileReceived) {
                    initialDmnFileReceived = true;
                    dmnFileResolver.done(dmnFileQuery);
                } else {
                    // A host push is authoritative; drop any pending outbound
                    // sync so a stale export can't clobber it after re-import.
                    debouncedSendChanges.cancel();
                    await debouncedUpdateXML(dmnFileQuery.content, documentRevision);
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
        case ["FlushDocumentQuery", "ReleaseDocumentFlushQuery"].includes(queryOrCommand.type): {
            await respondToFlush(message.data as FlushDocumentQuery | ReleaseDocumentFlushQuery);
            break;
        }
    }
}

/**
 * Starts the DMN webview against the given host. The entry (real or demo)
 * chooses the host.
 */
export function bootstrap(injectedHost: HostApi<WebviewState, Command | Query>): void {
    host = injectedHost;
    registerGlobalErrorHandlers();
    if (document.readyState === "complete") {
        void run();
    } else {
        window.addEventListener("load", () => void run());
    }
}
