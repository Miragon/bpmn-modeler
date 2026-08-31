/**
 * Host-adapter surface — the VS Code protocol adapter (Query/Command wiring,
 * `bootstrap`'s host handshake). Lives in the app, outside the publishable
 * `@miragon/bpmn-modeler` boundary.
 */
import {
    ApplyDiffHighlightsQuery,
    BpmnFileQuery,
    BpmnModelerSettingQuery,
    BpmnlintResultsQuery,
    ClipboardQuery,
    Command,
    CursorChangedCommand,
    ElementTemplatesQuery,
    LogDebugCommand,
    LogErrorCommand,
    LogInfoCommand,
    LogWarningCommand,
    PropertiesPanelStateQuery,
    Query,
    SyncDocumentCommand,
    HostApi,
    HostApiImpl,
    MockHostApi,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";
import type { DiffResult, DiffSide } from "@miragon/bpmn-modeler/diff";

import c7Samples from "./__fixtures__/c7-samples.json";
import c8Samples from "./__fixtures__/c8-samples.json";
import { MOCK_BPMN_XML } from "./__fixtures__/mock-bpmn";
import { MOCK_DIFF_AFTER_XML, MOCK_DIFF_BEFORE_XML } from "./__fixtures__/mock-diff";
import type { WebviewState } from "./webviewState";

declare const process: { env: { NODE_ENV: string } };

type StateType = WebviewState;

type MessageType = Command | Query;

/**
 * Returns the channel to the host application embedding this webview. In
 * `development` mode a {@link MockHost} is returned for standalone browser
 * runs; otherwise the real {@link HostApiImpl} is used (VS Code, IntelliJ, and
 * the desktop app all inject the same `acquireVsCodeApi()` shim, so they share
 * this path).
 */
export function getHostApi(): HostApi<StateType, MessageType> {
    if (process.env.NODE_ENV === "development") {
        return new MockHost();
    }
    return new HostApiImpl<StateType, MessageType>();
}

/**
 * Dev-only mode selector, driven by `?mode=` in the URL.
 *
 * `modeler` (default) — serves the full editable modeler, matches pre-existing
 *   dev behaviour.
 * `diff-before` / `diff-after` — serves the left or right pane of a diff view
 *   with real `bpmn-js-differ` highlights computed from two fixture XMLs.
 */
type DevMode = "modeler" | "diff-before" | "diff-after";

function readDevMode(): DevMode {
    const raw = new URLSearchParams(window.location.search).get("mode");
    if (raw === "diff-before" || raw === "diff-after" || raw === "modeler") {
        return raw;
    }
    if (raw !== null && raw !== "") {
        console.warn(
            `[dev] Unknown ?mode=${raw}; falling back to "modeler". ` +
                `Known values: modeler, diff-before, diff-after.`,
        );
    }
    return "modeler";
}

/**
 * Development-only mock that simulates the host application by dispatching
 * synthetic `MessageEvent`s in response to outbound commands.
 *
 * Selects behaviour from a {@link DevMode} derived from the URL.  Diff modes
 * lazily import the public `@miragon/bpmn-modeler/diff` data layer on the first
 * `DiffReadyCommand` so its `bpmn-moddle`/`bpmn-js-differ` deps stay out of the
 * production bundle (dead-code-eliminated along with the whole class when
 * `NODE_ENV` is production).
 */
class MockHost extends MockHostApi<StateType, MessageType> {
    private readonly devMode: DevMode = readDevMode();

    private cachedDiff: DiffResult | undefined;

    constructor() {
        super();
        console.info(
            "[dev] bpmn-webview mock ready.  Mode:",
            this.devMode,
            "\nURL variants: /, /?mode=diff-before, /?mode=diff-after",
        );
    }

    /**
     * Merges `state` into the current mock state, initialising it when no
     * state has been set yet (i.e. when {@link getState} would throw).
     *
     * @param state Partial state to merge.
     */
    override updateState(state: Partial<WebviewState>): void {
        try {
            this.setState({ ...this.getState(), ...state });
        } catch {
            this.setState(state as WebviewState);
        }
    }

    /**
     * Intercepts outbound messages and dispatches the corresponding inbound
     * response so the webview can operate without a real host.
     *
     * @param message The outbound command sent by the webview.
     */
    override postMessage(message: MessageType): void {
        switch (true) {
            case message.type === "GetBpmnFileCommand": {
                console.debug("[DEBUG] GetBpmnFileCommand", message);
                this.handleGetBpmnFile();
                break;
            }
            case message.type === "GetElementTemplatesCommand": {
                console.debug("[DEBUG] GetElementTemplatesCommand", message);
                dispatchEvent(
                    new ElementTemplatesQuery([
                        ...(c7Samples as unknown as JSON[]),
                        ...(c8Samples as unknown as JSON[]),
                    ]),
                );
                break;
            }
            case message.type === "GetBpmnModelerSettingCommand": {
                console.debug("[DEBUG] GetBpmnModelerSettingCommand", message);
                dispatchEvent(
                    new BpmnModelerSettingQuery({
                        alignToOrigin: false,
                        showTransactionBoundaries: true,
                        colorTheme: "light",
                    }),
                );
                break;
            }
            case message.type === "GetPropertiesPanelStateCommand": {
                console.debug("[DEBUG] GetPropertiesPanelStateCommand", message);
                dispatchEvent(new PropertiesPanelStateQuery(true));
                break;
            }
            case message.type === "SetPropertiesPanelStateCommand": {
                console.debug("[DEBUG] SetPropertiesPanelStateCommand", message);
                break;
            }
            case message.type === "GetClipboardCommand": {
                console.debug("[DEBUG] GetClipboardCommand", message);
                dispatchEvent(new ClipboardQuery(""));
                break;
            }
            case message.type === "SetClipboardCommand": {
                console.debug("[DEBUG] SetClipboardCommand", message);
                break;
            }
            case message.type === "SyncDocumentCommand": {
                console.debug(
                    "[DEBUG] SyncDocumentCommand",
                    (message as SyncDocumentCommand).content,
                );
                break;
            }
            case message.type === "LogDebugCommand": {
                console.debug((message as LogDebugCommand).message);
                break;
            }
            case message.type === "LogInfoCommand": {
                console.info((message as LogInfoCommand).message);
                break;
            }
            case message.type === "LogWarningCommand": {
                console.warn((message as LogWarningCommand).message);
                break;
            }
            case message.type === "LogErrorCommand": {
                console.error((message as LogErrorCommand).message);
                break;
            }
            case message.type === "LanguageQuery": {
                console.debug("[DEBUG] LanguageQuery", message);
                break;
            }
            case message.type === "DiffReadyCommand": {
                console.debug("[DEBUG] DiffReadyCommand");
                void this.handleDiffReady();
                break;
            }
            case message.type === "ViewportChangedCommand": {
                // Single-pane preview: there's no partner to sync with.
                console.debug(
                    "[DEBUG] ViewportChangedCommand (no partner in dev)",
                    (message as ViewportChangedCommand).viewport,
                );
                break;
            }
            case message.type === "CursorChangedCommand": {
                // Single-pane preview: stepper advances locally only.
                console.debug(
                    "[DEBUG] CursorChangedCommand (no partner in dev)",
                    (message as CursorChangedCommand).index,
                );
                break;
            }
            case message.type === "GetBpmnlintConfigCommand": {
                dispatchEvent(new BpmnlintResultsQuery(null));
                break;
            }
            case message.type === "SetLintingEnabledCommand": {
                console.debug("[DEBUG] SetLintingEnabledCommand", message);
                break;
            }
            // Capability-port commands. Dev keeps all capabilities so every
            // feature's UI stays testable; there is no real host to act on them,
            // so log-only cases replace the default throw that used to crash the
            // first SyncActivitiesCommand on load.
            case message.type === "NavigateToReferencedModelCommand": {
                console.debug("[DEBUG] NavigateToReferencedModelCommand", message);
                break;
            }
            case message.type === "NavigateToImplementationCommand": {
                console.debug("[DEBUG] NavigateToImplementationCommand", message);
                break;
            }
            case message.type === "SyncActivitiesCommand": {
                console.debug("[DEBUG] SyncActivitiesCommand", message);
                break;
            }
            case message.type === "OpenScriptEditorCommand": {
                console.debug("[DEBUG] OpenScriptEditorCommand", message);
                break;
            }
            case message.type === "UpdateScriptSourceCommand": {
                console.debug("[DEBUG] UpdateScriptSourceCommand", message);
                break;
            }
            case message.type === "UpdateScriptVariablesCommand": {
                console.debug("[DEBUG] UpdateScriptVariablesCommand", message);
                break;
            }
            default: {
                throw new Error(`Unknown message type: ${(message as MessageType).type}`);
            }
        }

        function dispatchEvent(event: MessageType) {
            window.dispatchEvent(
                new MessageEvent("message", {
                    data: event,
                }),
            );
        }
    }

    private handleGetBpmnFile(): void {
        switch (this.devMode) {
            case "diff-before":
                dispatch(new BpmnFileQuery(MOCK_DIFF_BEFORE_XML, "c7", "viewer"));
                return;
            case "diff-after":
                dispatch(new BpmnFileQuery(MOCK_DIFF_AFTER_XML, "c7", "viewer"));
                return;
            case "modeler":
                dispatch(new BpmnFileQuery(MOCK_BPMN_XML, "c7"));
                return;
        }
    }

    private async handleDiffReady(): Promise<void> {
        const side: DiffSide | undefined =
            this.devMode === "diff-before"
                ? "before"
                : this.devMode === "diff-after"
                  ? "after"
                  : undefined;
        if (!side) {
            // DiffReadyCommand arrived in modeler mode — ignore.
            return;
        }

        let result: DiffResult;
        try {
            result = await this.ensureCachedDiff();
        } catch (error) {
            console.error("[dev] Failed to compute mock diff; diff highlights unavailable.", error);
            return;
        }

        const { sideView } = await import("@miragon/bpmn-modeler/diff");
        const view = sideView(result, side);

        dispatch(
            new ApplyDiffHighlightsQuery(
                side,
                view.added,
                view.removed,
                view.changed,
                view.layoutChanged,
                result.counts,
                result.navigationOrder,
                // Dev preview mimics the "Compare Files" entry point so the legend
                // renders its filename, the branch that exercises the most chrome.
                "compare-files",
                side === "before" ? "before.bpmn" : "after.bpmn",
            ),
        );
    }

    private async ensureCachedDiff(): Promise<DiffResult> {
        if (this.cachedDiff) {
            return this.cachedDiff;
        }

        // Dynamic import keeps the diff data layer (and its ~200 KB of
        // bpmn-moddle/bpmn-js-differ deps) out of the production webview bundle:
        // Rollup emits it as a separate chunk that the dead-code-eliminated
        // MockHost never loads when NODE_ENV is production.
        const { computeDiff } = await import("@miragon/bpmn-modeler/diff");
        this.cachedDiff = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);
        return this.cachedDiff;
    }
}

function dispatch(event: MessageType): void {
    window.dispatchEvent(new MessageEvent("message", { data: event }));
}
