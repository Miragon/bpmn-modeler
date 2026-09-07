// css — webview page chrome first, then the package's own light base + scoped
// dark theme (folded into the bundle via `@miragon/dmn-modeler`'s styles import),
// matching the previous `styles.css`-then-`#theme-link` cascade order.
import "./styles.css";

import {
    applyPageThemeScope,
    Command,
    createFlushResponder,
    createHostThemeAdapter,
    createResolver,
    DmnFileQuery,
    DmnModelerSettingQuery,
    FlushDocumentQuery,
    GetDmnFileCommand,
    GetDmnModelerSettingCommand,
    GetPropertiesPanelStateCommand,
    type HostThemeAdapter,
    initResizer,
    installPanelShortcuts,
    LogErrorCommand,
    LogWarningCommand,
    PropertiesPanelStateQuery,
    Query,
    ReleaseDocumentFlushQuery,
    resolveHostThemeKind,
    SetPropertiesPanelStateCommand,
    SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";
import { asyncDebounce, NoModelerError, serializeAsync } from "@miragon/bpmn-modeler-types";
import { i18n } from "@miragon/bpmn-modeler-i18n";

import { createModeler, readSavedPanelVisibility, WebviewStateManager } from "./app";
import type { DmnModelerHandle } from "./app";
import type { HostApi } from "@miragon/bpmn-modeler-shared";
import type { WebviewState } from "./app/host";

// Injected by bootstrap(); the app/demo entry chooses the concrete host.
let host: HostApi<WebviewState, Command | Query>;
let modeler: DmnModelerHandle | undefined;
let themeAdapter: HostThemeAdapter | undefined;

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
        exportContent: () => getModeler().exportDiagram(),
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
 * Upper bound (ms) on how long bootstrap waits for a host reply before
 * continuing without it, so a dropped settings / panel-state reply can no longer
 * stall the restore chain (`restorePanelUiState` / `startPersisting`).
 */
const RESOLVER_TIMEOUT_MS = 5000;

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

    // Theme is host policy: drive the page-level scope (host chrome, keyed off
    // `:root[data-dmn-theme="dark"]`) and the modeler instance's own theme off
    // the VS Code `<body>`-class signal. The instance is also born correct via
    // `theme: resolveHostThemeKind()` below, so this mainly covers the page
    // chrome and later live theme switches. The host's `colorTheme` preference
    // (which may force light) is applied once the setting query arrives below.
    themeAdapter = createHostThemeAdapter((kind) => {
        applyPageThemeScope("data-dmn-theme", kind);
        modeler?.setTheme(kind);
    });
    themeAdapter.setMode("automatic");

    const canvas = requireElement("#js-canvas");
    const propertiesPanel = requireElement("#js-properties-panel");
    modeler = await createModeler(canvas, {
        propertiesPanel: { parent: propertiesPanel },
        theme: resolveHostThemeKind(),
        onContentChanged: () => void debouncedSendChanges(),
        onWarning: (message) => host.postMessage(new LogWarningCommand(message)),
    });

    // Labels reuse the BPMN i18n keys; DMN has no language wiring yet, so they
    // render the English fallback until that lands.
    const propertiesPanelHandle = initResizer({
        getToggleLabel: (state) =>
            i18n.translate(
                state === "collapsed" ? "Open properties panel" : "Close properties panel",
            ) + " (Shift+P)",
        onLabelChange: (apply) => i18n.onChange(apply),
    });

    // Early-apply this editor's own saved panel visibility (if any) so the panel
    // snaps to the correct per-editor state without waiting on the host and
    // without flashing the pre-rendered global default. Applied via the handle
    // so the resizer's DOM-seeded `isCollapsed` stays in sync.
    const savedPanelVisible = readSavedPanelVisibility(host);
    if (savedPanelVisible !== undefined) {
        propertiesPanelHandle.setVisible(savedPanelVisible);
    }

    host.postMessage(new GetDmnFileCommand());
    host.postMessage(new GetPropertiesPanelStateCommand());
    host.postMessage(new GetDmnModelerSettingCommand());
    const dmnFile = await dmnFileResolver.wait();
    await initializeModeler(dmnFile?.content, dmnFile?.documentRevision);
    await flushPendingHostUpdates();
    modelerIsInitialized = true;

    // Block until the host's color-theme preference has been applied (the
    // handler in onReceiveMessage swaps the stylesheet) so the modeler doesn't
    // settle on the wrong theme before the user setting arrives. Timed out so a
    // dropped reply can't stall the restore chain below.
    await settingsResolver.wait(RESOLVER_TIMEOUT_MS);

    // Panel visibility: this editor's own saved entry (applied early above) wins;
    // only when absent do we fall back to the host's global default. Then report
    // toggles back — persisting per-editor state and seeding the global default.
    // Registered after restore so the restore itself can't echo back.
    if (savedPanelVisible === undefined) {
        const panelState = await panelStateResolver.wait(RESOLVER_TIMEOUT_MS);
        stateManager.restorePanelVisibility(propertiesPanelHandle, panelState?.visible ?? true);
    }
    propertiesPanelHandle.onVisibilityChanged((visible) => {
        stateManager.persistPanelVisibility(visible);
        host.postMessage(new SetPropertiesPanelStateCommand(visible));
    });

    // `p` / `Shift+P` / Escape shortcuts for the properties panel, gated to
    // the DRD view so they stay inert in decision-table and literal-expression
    // views (where Escape must not steal focus from cell editing).
    installPanelShortcuts({
        handle: propertiesPanelHandle,
        focusCanvas: () => getModeler().focusCanvas(),
        isCanvasFocused: () => getModeler().isCanvasFocused(),
        isEnabled: () => getModeler().isDrdViewActive(),
        escapeToCanvas: true,
    });

    stateManager.restorePanelUiState();
    stateManager.startPersisting();
}

async function initializeModeler(dmnFile: string | undefined, documentRevision = 0) {
    try {
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
 * @throws NoModelerError if the modeler is not initialized
 */
async function openXML(dmn: string | undefined) {
    if (!dmn) {
        return;
    }

    await getModeler().loadDiagram(dmn);
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
        const dmn = await getModeler().exportDiagram();
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
            themeAdapter?.setMode(settingQuery.setting.colorTheme);
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

function getModeler(): DmnModelerHandle {
    if (!modeler) {
        throw new NoModelerError();
    }
    return modeler;
}

function requireElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
        throw new Error(`Missing required DMN modeler element <${selector}>`);
    }
    return element;
}
