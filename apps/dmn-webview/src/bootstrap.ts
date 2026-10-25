// css — webview page chrome first, then the package's own light base + scoped
// dark theme (folded into the bundle via `@miragon/dmn-modeler`'s styles import),
// matching the previous `styles.css`-then-`#theme-link` cascade order.
import "./styles.css";

import {
    applyPageThemeScope,
    Command,
    createHostThemeAdapter,
    createResolver,
    createWebviewStateStore,
    DmnModelerSettingQuery,
    GetDmnFileCommand,
    GetDmnModelerSettingCommand,
    GetPropertiesPanelStateCommand,
    HOST_REPLY_TIMEOUT_MS,
    type HostThemeMode,
    initResizer,
    installCanvasAutoFocus,
    installGlobalErrorForwarding,
    installPanelShortcuts,
    LogWarningCommand,
    PropertiesPanelStateQuery,
    PropertiesPanelUiStateAdapter,
    Query,
    readSavedPanelVisibility,
    RequestFocusCommand,
    resolveHostThemeKind,
    SetPropertiesPanelStateCommand,
} from "@miragon/bpmn-modeler-shared";
import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { createModeler, type DmnAdditionalModules } from "@miragon/dmn-modeler";

import type { HostApi } from "@miragon/bpmn-modeler-shared";
import { DmnDocumentSession } from "./documentSession";
import { routeDmnHostMessage } from "./hostMessageRouter";
import type { WebviewState } from "./webviewState";

/**
 * Injection seam for the entry. `theme`/`locale` seed the initial
 * mode; `additionalModules` lets the dev entry register per-view didi modules
 * (the translate-harvest recorder) without touching the production path.
 */
interface BootstrapOptions {
    theme?: HostThemeMode;
    locale?: SupportedLocale;
    additionalModules?: DmnAdditionalModules;
}

type DmnHost = HostApi<WebviewState, Command | Query>;

/**
 * Starts the DMN webview against the given host. The entry chooses the host
 * and, optionally, seeds the initial theme mode / locale when it has no host
 * settings reply to wait on. Every call starts an independent session.
 *
 * @returns Stops the session: it no longer reacts to the host or the page,
 *   drops its pending syncs, and destroys its modeler.
 */
export function bootstrap(host: DmnHost, opts: BootstrapOptions = {}): () => void {
    const session = new DmnDocumentSession(host);
    const lifetime = new AbortController();
    const stopErrorForwarding = installGlobalErrorForwarding((command) =>
        host.postMessage(command),
    );

    // Best-effort flush of the outbound sync debounce when the webview is hidden
    // (tab switch / close). Reliable in the persistent JCEF host; in VS Code the
    // webview context may die mid-export, so this only mitigates the ≤300ms
    // hide-loss window — the save path is fully covered by the flush protocol.
    document.addEventListener(
        "visibilitychange",
        () => {
            if (document.visibilityState === "hidden") {
                void session.flushPendingSync();
            }
        },
        { signal: lifetime.signal },
    );

    const start = (): void => void run(host, opts, session, lifetime.signal);
    if (document.readyState === "complete") {
        start();
    } else {
        window.addEventListener("load", start, { signal: lifetime.signal });
    }

    return () => {
        lifetime.abort();
        stopErrorForwarding();
        session.dispose();
    };
}

/**
 * The Main function that gets executed after the webview is fully loaded.
 * This way we can ensure that when the backend sends a message, it is caught.
 * There are two reasons why a webview gets build:
 * 1. A new .dmn file was opened
 * 2. User switched to another tab and now switched back
 */
async function run(
    host: DmnHost,
    opts: BootstrapOptions,
    session: DmnDocumentSession,
    stopSignal: AbortSignal,
): Promise<void> {
    const canvas = requireElement("#js-canvas");
    const propertiesPanel = requireElement("#js-properties-panel");
    const panelUiState = new PropertiesPanelUiStateAdapter(
        createWebviewStateStore(host),
        propertiesPanel,
    );
    const panelStateReply = createResolver<PropertiesPanelStateQuery>();
    const settingsReply = createResolver<DmnModelerSettingQuery>();

    // Theme is host policy: drive the page-level scope (host chrome, keyed off
    // `:root[data-dmn-theme="dark"]`) and the modeler instance's own theme off
    // the VS Code `<body>`-class signal. The instance is also born correct via
    // `theme: resolveHostThemeKind()` below; the adapter covers the page chrome,
    // a forced `opts.theme` seam, and later live theme switches. The host's
    // `colorTheme` preference (which may force light) is applied once the setting
    // query arrives below.
    const themeAdapter = createHostThemeAdapter((kind) => {
        applyPageThemeScope("data-dmn-theme", kind);
        session.modeler?.setTheme(kind);
    });
    stopSignal.addEventListener("abort", () => themeAdapter.dispose());

    const replies = { panelState: panelStateReply, settings: settingsReply, theme: themeAdapter };
    window.addEventListener(
        "message",
        (event: MessageEvent<Query | Command>) =>
            void routeDmnHostMessage(event.data, session, replies),
        { signal: stopSignal },
    );

    // Seed the locale before the modeler renders so the resizer labels and the
    // dmn-js UI come up translated on first paint.
    if (opts.locale) {
        i18n.setLanguage(opts.locale);
    }

    const modeler = await createModeler(canvas, {
        propertiesPanel: { parent: propertiesPanel },
        theme: resolveHostThemeKind(),
        additionalModules: opts.additionalModules,
        onContentChanged: () => session.scheduleSync(),
        onWarning: (message) => host.postMessage(new LogWarningCommand(message)),
    });
    if (stopSignal.aborted) {
        modeler.destroy();
        return;
    }
    session.attachModeler(modeler);

    // Drive the mode only after the instance exists so a forced `opts.theme`
    // (an entry that never gets a settings reply) actually reaches
    // `modeler.setTheme`; "automatic" reproduces today's follow-the-IDE
    // behaviour and installs the live `<body>`-class observer.
    themeAdapter.setMode(opts.theme ?? "automatic");

    // Resizer labels reuse the shared i18n keys and follow the locale live via
    // `i18n.onChange` (the dmn-js UI itself re-translates on a view re-open).
    const propertiesPanelHandle = initResizer({
        getToggleLabel: (state) =>
            i18n.translate(
                state === "collapsed" ? "Open properties panel" : "Close properties panel",
            ) + " (Shift+P)",
        onLabelChange: (apply) => i18n.onChange(apply),
    });
    stopSignal.addEventListener("abort", () => propertiesPanelHandle.dispose());

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
    await session.openInitialDocument();

    // Block until the host's color-theme preference has been applied (the
    // settings reply re-themes via the adapter) so the modeler doesn't settle on
    // the wrong theme before the user setting arrives. Timed out so a dropped
    // reply can't stall the restore chain below.
    await settingsReply.wait(HOST_REPLY_TIMEOUT_MS);

    // Panel visibility: this editor's own saved entry (applied early above) wins;
    // only when absent do we fall back to the host's global default. Then report
    // toggles back — persisting per-editor state and seeding the global default.
    // Registered after restore so the restore itself can't echo back.
    if (savedPanelVisible === undefined) {
        const panelState = await panelStateReply.wait(HOST_REPLY_TIMEOUT_MS);
        panelUiState.restorePanelVisibility(propertiesPanelHandle, panelState?.visible ?? true);
    }
    if (stopSignal.aborted) return;
    propertiesPanelHandle.onVisibilityChanged((visible) => {
        panelUiState.persistPanelVisibility(visible);
        host.postMessage(new SetPropertiesPanelStateCommand(visible));
    });

    // `p` / `Shift+P` / Escape shortcuts for the properties panel, gated to
    // the DRD view so they stay inert in decision-table and literal-expression
    // views (where Escape must not steal focus from cell editing).
    installPanelShortcuts({
        handle: propertiesPanelHandle,
        focusCanvas: () => session.focusCanvas(),
        isCanvasFocused: () => session.requireModeler().isCanvasFocused(),
        // The shortcut listener cannot be removed, so a stopped session disables it here.
        isEnabled: () => session.modeler?.isDrdViewActive() ?? false,
        escapeToCanvas: true,
    });
    // Ungated, unlike the shortcuts: the handle's focusCanvas already ignores non-DRD views.
    const removeCanvasAutoFocus = installCanvasAutoFocus({
        focusCanvas: () => session.focusCanvas(),
    });
    stopSignal.addEventListener("abort", removeCanvasAutoFocus);
    host.postMessage(new RequestFocusCommand());

    panelUiState.restoreGroupsAndScroll();
    panelUiState.startPersisting();
}

function requireElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
        throw new Error(`Missing required DMN modeler element <${selector}>`);
    }
    return element;
}
