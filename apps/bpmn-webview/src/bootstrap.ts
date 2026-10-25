import type { ClipboardOptions, LintingOptions, ModelerCapabilities } from "@miragon/bpmn-modeler";
import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";
import {
    type BpmnModelerSettingQuery,
    type Command,
    type ElementTemplatesQuery,
    GetBpmnFileCommand,
    GetBpmnModelerSettingCommand,
    GetPropertiesPanelStateCommand,
    HOST_REPLY_TIMEOUT_MS,
    type HostApi,
    type PropertiesPanelStateQuery,
    type Query,
    RequestFocusCommand,
    SetPropertiesPanelStateCommand,
    applyPageThemeScope,
    createHostThemeAdapter,
    createInertLockGroup,
    createResolver,
    installCanvasAutoFocus,
    installGlobalErrorForwarding,
    installPanelShortcuts,
    resolveHostThemeKind,
    takeFocus,
} from "@miragon/bpmn-modeler-shared";
import type { LintRunEvent } from "@miragon/bpmn-modeler-types";
import { installHostEditorActions } from "./hostEditorActions";
import { HostModelerState } from "./hostModelerState";
import { BpmnDocumentSession, type Translator } from "./session/documentSession";
import { mountEditorChrome } from "./session/editorChrome";
import { createLintBridge } from "./session/lintBridge";
import {
    createHostMessageRouter,
    createSessionMessageRouter,
    type DiffPaneHostMessages,
    type HostMessage,
} from "./session/messageRouter";
import { createModeController } from "./session/modeController";
import { createProtocolCapabilities } from "./session/protocolCapabilities";
import { resolveClipboard } from "./session/protocolClipboard";
import { createSurfaceBinder } from "./session/surfaceBinding";
import { createSurfaceDocument } from "./session/surfaceDocument";
import { createSurfaceFactories } from "./session/surfaceFactories";
import { createSurfaceRequests } from "./session/surfaceRequests";
import { readSavedMode } from "./state";
import { isEditableHandle } from "./surface";
import { prefetchSurfaceModules } from "./surfaceModules";
import type { WebviewState } from "./webviewState";
import "../../../packages/bpmn-modeler/src/styles/mode.css";

interface BootstrapOptions {
    /** Host-specific extra bpmn-js DI modules. */
    extraModules?: unknown[];
    /**
     * Explicit per-feature ports; `undefined` selects the full protocol adapter
     * so every real host keeps all features.
     */
    capabilities?: ModelerCapabilities;
    /** The bpmnlint tier; `undefined` selects the external (host-pushed) tier that real hosts use. */
    linting?: LintingOptions;
    /**
     * The clipboard tier; `undefined` selects dev-build native, otherwise the
     * protocol bridge. `"native"` forces the browser clipboard; `{ bridge }`
     * routes through a caller-supplied override.
     */
    clipboard?: ClipboardOptions | "native";
    /**
     * In-page lint-run sink; only a consumer opting into in-page linting passes
     * one. Real hosts run the linter themselves.
     */
    onLintResults?: (event: LintRunEvent) => void;
    /** Restarts the containing webview after an engine change. */
    reload?: () => void;
}

/**
 * Starts the BPMN webview against the given host. The entry chooses the host,
 * any host-specific bpmn-js modules, and — optionally — the per-feature
 * {@link ModelerCapabilities}. Omitting `capabilities` selects the
 * full protocol adapter, so every real host keeps all features; passing a
 * partial object turns off the features whose ports it omits.
 *
 * Each call is one webview session. The modeler, resolvers, debounced syncs,
 * flush responder, and the "is initialized" latch are scoped to it so a
 * session owns its own lifetime rather than a page-wide singleton — the
 * prerequisite for hosting more than one modeler on a page. Single-instance
 * hosts (VS Code, IntelliJ, Theia) call it exactly once.
 */
export function bootstrap(
    host: HostApi<WebviewState, Command | Query>,
    opts: BootstrapOptions = {},
): void {
    const translator: Translator = {
        getLocale: () => i18n.getLocale(),
        setLanguage: (locale) => i18n.setLanguage(locale as SupportedLocale),
    };
    const pageInertLocks = createInertLockGroup(document.body);
    const hostModelerState = new HostModelerState();
    const modeController = createModeController(host, { hostModelerState, pageInertLocks });
    const { getSurface, focusCanvas } = modeController;

    // Theme is host policy: drive the page-level scope (host chrome + the
    // viewer/diff branch, which has no modeler) and the modeler instance's
    // own theme off the VS Code `<body>`-class signal.
    const themeAdapter = createHostThemeAdapter((kind) => {
        applyPageThemeScope("data-bpmn-theme", kind);
        modeController.setTheme(kind);
    });
    const protocolCapabilities = createProtocolCapabilities(host, getSurface);
    const clipboard = resolveClipboard(opts.clipboard, {
        isDevelopment: process.env.NODE_ENV === "development",
        host,
    });
    const lintBridge = createLintBridge(
        host,
        { linting: opts.linting, onLintResults: opts.onLintResults },
        getSurface,
    );

    // Resolvers that signal when element templates and settings have been
    // applied. Selection restore is deferred until both complete so that
    // side-effects (e.g. transaction-boundary rendering) do not clear the
    // restored selection.
    const elementTemplatesResolver = createResolver<ElementTemplatesQuery>();
    const settingsResolver = createResolver<BpmnModelerSettingQuery>();

    // Resolves once the host has replied with the global properties-panel
    // default. The webview uses this value only when its own webview state has
    // no panelVisible entry — see WebviewStateManager.restorePanelVisibility.
    const panelStateResolver = createResolver<PropertiesPanelStateQuery>();

    const surfaceRequests = createSurfaceRequests(host, getSurface, {
        hostModelerState,
        theme: themeAdapter,
        replies: { elementTemplates: elementTemplatesResolver, settings: settingsResolver },
    });

    const session = new BpmnDocumentSession(host, {
        surface: createSurfaceDocument(host, modeController),
        page: {
            cancelPendingSurfaceWork: modeController.disposeSurfaceBinding,
            flushViewport: () => modeController.getViewState()?.flushViewport(),
            destroySurface: () => getSurface().destroy(),
            reloadPage: () => (opts.reload ?? (() => window.location.reload()))(),
        },
        translator,
        pageInertLocks,
    });

    const sessionMessages = createSessionMessageRouter(
        host,
        {
            // Before the spreads, so tsc rejects a group that also handles one of these.
            PropertiesPanelStateQuery: (query) => panelStateResolver.done(query),
            TakeFocusQuery: () => takeFocus(focusCanvas),
            ...session.handlers,
            ...surfaceRequests.handlers,
            ...lintBridge.handlers,
            ...clipboard.handlers,
            ...protocolCapabilities.handlers,
        },
        session,
    );

    /**
     * Entry point executed once the webview DOM is fully loaded.
     *
     * Registers the message listener first so no backend messages are missed,
     * then requests the BPMN file together with the settings and panel state.
     * Element templates and the lint config depend on the surface kind, so they
     * are requested once the surface exists but before the import. Replies that
     * act on the diagram are held until the initial import has completed.
     *
     * There are two reasons the webview is built:
     * 1. A new `.bpmn` file was opened.
     * 2. The user switched away and back to the tab.
     */
    async function run(): Promise<void> {
        // The diff branch below swaps in its own router once the host names the pane.
        let routeHostMessage = sessionMessages.route;
        window.addEventListener("message", (event: MessageEvent<HostMessage>) =>
            routeHostMessage(event.data),
        );

        // Merge the modeler's local overlay (mode-strip labels, script-lock
        // badges, C7/dmn-js internals the shared package lacks) onto the shared
        // dictionaries. createModeler/createDesigner also extend it, but the mode
        // strip mounts before any surface and a View-first start never builds a
        // modeler, so the webview extends here so the strip is translated either
        // way. Idempotent — a later surface's extend is a no-op merge.
        i18n.extend(i18nExtras);

        // The instance is also born correct via `theme: resolveHostThemeKind()`
        // below, so this mainly covers the page chrome and later live theme switches.
        themeAdapter.setMode("automatic");

        // Viewer mode (one side of a diff view) skips the resizer + properties
        // panel + palette, so we don't call initResizer() here — the chrome is
        // hidden by .viewer-mode CSS once we confirm the mode below. For the
        // modeler path, mountEditorChrome() calls it after the branch check.

        host.postMessage(new GetBpmnFileCommand());
        host.postMessage(new GetBpmnModelerSettingCommand());
        host.postMessage(new GetPropertiesPanelStateCommand());
        const savedMode = readSavedMode(host);
        if (savedMode) {
            prefetchSurfaceModules(savedMode, { linting: opts.linting === undefined });
        }

        const bpmnFileQuery = await session.waitForInitialHostFile();

        // Before any surface exists, so the matching LanguageQuery later skips the re-import.
        if (bpmnFileQuery?.locale) {
            translator.setLanguage(bpmnFileQuery.locale);
        }

        /**
         * Diff view: host told us this pane is one half of a diff, so bootstrap
         * the readonly DiffMode and skip the editable modeler entirely.
         */
        if (bpmnFileQuery?.viewerMode === "viewer") {
            // A diff pane has no surface for the held replies or any later session
            // message; it only follows language changes.
            sessionMessages.discardImportBound();
            routeHostMessage = createHostMessageRouter<DiffPaneHostMessages>(host, {
                LanguageQuery: (query) => translator.setLanguage(query.locale),
            });
            document.body.classList.add("viewer-mode");
            const canvas = document.getElementById("js-canvas");
            const dropZone = document.getElementById("js-drop-zone");
            if (!canvas || !dropZone) {
                console.error("Diff mode: missing #js-canvas or #js-drop-zone");
                return;
            }
            const { DiffMode } = await import("./diffMode");
            const diffMode = new DiffMode(canvas, dropZone, host);
            await diffMode.startWith(bpmnFileQuery.content);
            return;
        }

        const chrome = mountEditorChrome(host);
        if (!chrome) return;

        // The engine may be undefined here — an untagged (engine-neutral) model
        // is first-class now and opens in Design. The initial mode resolves from
        // this editor's saved mode, then the host's default, then the engine's
        // own default — the mode session vets it against availability.
        const engine = bpmnFileQuery?.engine;

        const capabilities = opts.capabilities ?? protocolCapabilities.capabilities;

        const started = await modeController.start({
            session,
            binder: createSurfaceBinder(host, {
                session,
                panelRoot: chrome.panelMount,
                engine,
                capabilities,
                elementTemplatesReply: elementTemplatesResolver,
            }),
            container: chrome.canvas,
            engine,
            surfaces: createSurfaceFactories(host, {
                propertiesPanelParent: chrome.panelMount,
                capabilities,
                extraModules: opts.extraModules ?? [],
                clipboard: clipboard.options,
                lintBridge,
                hostModelerState,
                reportElementTemplateErrors: surfaceRequests.reportElementTemplateErrors,
                onModelerModeChanged: modeController.followModelerToggle,
            }),
            initialMode: savedMode ?? bpmnFileQuery?.defaultMode ?? null,
            theme: resolveHostThemeKind(),
            strip: { host: chrome.panelHost, stripEl: chrome.stripEl },
        });
        if (!started) return;

        if (!(await session.openInitialDocument(bpmnFileQuery))) return;

        const currentBpmnFileQuery = session.latestHostFile ?? bpmnFileQuery;

        if (opts.capabilities === undefined) {
            protocolCapabilities.requestFormReferenceStatus(currentBpmnFileQuery?.engine);
        }

        console.debug("[DEBUG] Modeler is initialized...");

        const viewState = modeController.bindInitialSurface();

        // Lets the IntelliJ JCEF host drive undo/redo: it swallows Ctrl+Z/Ctrl+Y
        // at the IDE level before bpmn-js sees them. Installed once, over the
        // polymorphic surface; the readonly viewer has no editorActions service,
        // so the trigger is guarded.
        installHostEditorActions((action) => {
            const surface = getSurface();
            if (isEditableHandle(surface)) {
                surface
                    .getService<{ trigger(action: string): void }>("editorActions")
                    .trigger(action);
            }
        });

        // Phase 1: restore the persisted plane and viewport (canvas exists after
        // the initial import); the surface itself fits a fresh open.
        viewState.restoreViewport();

        await session.drainPendingActions();
        if (session.isReloadingForEngine) return;
        session.markInitialized();
        sessionMessages.openImportBound();
        // A held LanguageQuery may have queued a refresh; it must land before
        // the selection restore below.
        await session.drainPendingActions();
        if (session.isReloadingForEngine) return;

        // Panel visibility: this editor's own saved entry (applied by mountEditorChrome)
        // wins. Only when absent do we fall back to the host's global default —
        // the seed for a first-ever open. This branch is deliberately *not*
        // gated on templates/settings, so a slow or dropped templates reply
        // cannot leave the panel stuck at the pre-rendered default.
        if (chrome.savedPanelVisible === undefined) {
            const panelStateQuery = await panelStateResolver.wait(HOST_REPLY_TIMEOUT_MS);
            if (session.isReloadingForEngine) return;
            viewState.restorePanelVisibility(chrome.panel, panelStateQuery?.visible ?? true);
        }

        // Report user toggles: persist this editor's own state AND update the
        // host's global default so the latest preference seeds new editors.
        // Registered after restore so the restore itself can't echo back.
        chrome.panel.onVisibilityChanged((visible) => {
            modeController.getViewState()?.persistPanelVisibility(visible);
            host.postMessage(new SetPropertiesPanelStateCommand(visible));
        });

        // `p` focuses the panel mount (expanding it first if collapsed); `Shift+P`
        // toggles panel visibility. Installed once, over the polymorphic surface.
        installPanelShortcuts(
            {
                handle: chrome.panel,
                focusCanvas,
                isCanvasFocused: () =>
                    getSurface().getService<{ isFocused(): boolean }>("canvas").isFocused(),
            },
            { getPanelRoot: () => chrome.panelMount },
        );
        installCanvasAutoFocus({ focusCanvas });
        host.postMessage(new RequestFocusCommand());

        // Selection + panel-side UI state must wait until element-template and
        // settings side-effects have run (they clear selection; group indexes are
        // positional per selected element). The timeouts guarantee this chain
        // always reaches startPersisting even if a host reply is dropped.
        await Promise.all([
            elementTemplatesResolver.wait(HOST_REPLY_TIMEOUT_MS),
            settingsResolver.wait(HOST_REPLY_TIMEOUT_MS),
        ]);
        if (session.isReloadingForEngine) return;

        // Phase 2: restore selection + panel-side UI state (side-effects done)
        viewState.restoreSelection();
        viewState.restorePanelUiState();

        modeController.markInitialSurfaceReady();

        // Phase 3: begin persisting changes
        viewState.startPersisting();
    }

    // Best-effort flush of the outbound sync debounce when the webview is hidden
    // (tab switch / close). Reliable in the persistent JCEF host; in VS Code the
    // webview context may be torn down mid-export, so this is a best-effort
    // mitigation of the ≤300ms hide-loss window — the save path is fully covered
    // by the flush protocol instead. Registered per-session (not at import) so a
    // torn-down session leaves no listener behind.
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && !session.isReloadingForEngine) {
            session.flushSyncOnHide();
            modeController.getViewState()?.flushViewport();
        }
    });

    installGlobalErrorForwarding((command) => host.postMessage(command));
    if (document.readyState === "complete") {
        void run();
    } else {
        window.addEventListener("load", () => void run());
    }
}
