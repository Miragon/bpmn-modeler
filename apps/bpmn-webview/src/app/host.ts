import {
    ApplyDiffHighlightsQuery,
    BpmnFileQuery,
    BpmnModelerSettingQuery,
    buildFlowOrder,
    buildRemovedAnchors,
    ClipboardQuery,
    Command,
    CursorChangedCommand,
    DiffCounts,
    DiffSide,
    ElementTemplatesQuery,
    LogDebugCommand,
    LogErrorCommand,
    LogInfoCommand,
    LogWarningCommand,
    PropertiesPanelStateQuery,
    Query,
    sortIdsByOrder,
    SyncDocumentCommand,
    HostApi,
    HostApiImpl,
    MockHostApi,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";

import c7Samples from "./__fixtures__/c7-samples.json";
import c8Samples from "./__fixtures__/c8-samples.json";
import { MOCK_BPMN_XML } from "./__fixtures__/mock-bpmn";
import { MOCK_DIFF_AFTER_XML, MOCK_DIFF_BEFORE_XML } from "./__fixtures__/mock-diff";

declare const process: { env: { NODE_ENV: string } };

/**
 * Canvas position and zoom level captured from diagram-js.
 */
export interface ViewportData {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Shape of the data persisted via the host's `setState` / `getState`.
 */
export interface WebviewState {
    viewport?: ViewportData;
    selectedElementIds?: string[];
    // Scroll position of `.bio-properties-panel-scroll-container`.
    panelScroll?: number;
    /**
     * Indexes (in render order) of `.bio-properties-panel-group` elements
     * that are currently expanded.  Keyed by position so it survives a
     * language switch — group labels are localised, indexes are not.
     */
    expandedGroupIndexes?: number[];
}

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

/**
 * Pre-computed diff sliced per side — cached on the mock instance.
 */
interface CachedDiff {
    before: {
        removed: string[];
        changed: string[];
        layoutChanged: string[];
    };
    after: {
        added: string[];
        changed: string[];
        layoutChanged: string[];
    };
    counts: DiffCounts;
    // Pre-merged sequence-flow order shared by both panes.
    navigationOrder: string[];
}

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
 * lazily import `bpmn-moddle` + `bpmn-js-differ` on the first
 * `DiffReadyCommand` so those dependencies stay out of the production bundle
 * (dead-code-eliminated along with the whole class when `NODE_ENV` is
 * production).
 */
class MockHost extends MockHostApi<StateType, MessageType> {
    private readonly devMode: DevMode = readDevMode();

    private cachedDiff: CachedDiff | undefined;

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
                        alignToOrigin: true,
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

        let cached: CachedDiff;
        try {
            cached = await this.ensureCachedDiff();
        } catch (error) {
            console.error("[dev] Failed to compute mock diff; diff highlights unavailable.", error);
            return;
        }

        const slice = cached[side];
        const added = side === "after" ? (slice as { added: string[] }).added : [];
        const removed = side === "before" ? (slice as { removed: string[] }).removed : [];

        dispatch(
            new ApplyDiffHighlightsQuery(
                side,
                added,
                removed,
                slice.changed,
                slice.layoutChanged,
                cached.counts,
                cached.navigationOrder,
                // Dev preview mimics the "Compare Files" entry point so the legend
                // renders its filename, the branch that exercises the most chrome.
                "compare-files",
                side === "before" ? "before.bpmn" : "after.bpmn",
            ),
        );
    }

    private async ensureCachedDiff(): Promise<CachedDiff> {
        if (this.cachedDiff) {
            return this.cachedDiff;
        }

        // Dynamic imports keep these ~200 KB of dev-only dependencies out of
        // the production webview bundle (Rollup emits them as separate chunks
        // that the dead-code-eliminated MockHost never loads).
        //
        // `bpmn-moddle`'s default export is the `simple` factory, not a class —
        // it must be called without `new` (call it as a plain function).
        // Under Vite's ESM interop the `.default` lives on the module
        // namespace, while some bundlers place it on a nested `.default` —
        // handle both shapes.
        // Vite's dep optimizer pre-bundles `bpmn-moddle` such that the
        // factory is exposed as a named export `BpmnModdle`, while the
        // webpack/CJS shape exposes it as `.default`.  Accept both.
        const moddleMod = (await import("bpmn-moddle")) as unknown as {
            default?: () => {
                fromXML: (xml: string) => Promise<{ rootElement: unknown }>;
            };
            BpmnModdle?: () => {
                fromXML: (xml: string) => Promise<{ rootElement: unknown }>;
            };
        };
        const createBpmnModdle = moddleMod.default ?? moddleMod.BpmnModdle;
        if (typeof createBpmnModdle !== "function") {
            throw new Error(
                "bpmn-moddle did not expose a factory under `default` or `BpmnModdle`.",
            );
        }

        const { diff } = await import("bpmn-js-differ");

        const moddle = createBpmnModdle();
        const beforeDefs = (await moddle.fromXML(MOCK_DIFF_BEFORE_XML)).rootElement;
        const afterDefs = (await moddle.fromXML(MOCK_DIFF_AFTER_XML)).rootElement;
        const result = diff(
            beforeDefs as Parameters<typeof diff>[0],
            afterDefs as Parameters<typeof diff>[1],
        );

        const added = Object.keys(result._added);
        const removed = Object.keys(result._removed);
        const changed = Object.keys(result._changed);
        const layoutChanged = Object.keys(result._layoutChanged);

        const afterOrder = buildFlowOrder(afterDefs as never);
        const removedAnchors = buildRemovedAnchors(removed, beforeDefs as never, afterOrder);
        const sortedAdded = sortIdsByOrder(added, afterOrder);
        const sortedRemoved = sortIdsByOrder(removed, removedAnchors);
        const sortedChanged = sortIdsByOrder(changed, afterOrder);
        const sortedLayoutChanged = sortIdsByOrder(layoutChanged, afterOrder);
        const merged: string[] = [];
        const seen = new Set<string>();
        for (const id of [
            ...sortedAdded,
            ...sortedRemoved,
            ...sortedChanged,
            ...sortedLayoutChanged,
        ]) {
            if (!seen.has(id)) {
                seen.add(id);
                merged.push(id);
            }
        }
        const navigationOrder = sortIdsByOrder(merged, afterOrder, removedAnchors);

        this.cachedDiff = {
            before: {
                removed: sortedRemoved,
                changed: sortedChanged,
                layoutChanged: sortedLayoutChanged,
            },
            after: {
                added: sortedAdded,
                changed: sortedChanged,
                layoutChanged: sortedLayoutChanged,
            },
            counts: {
                added: added.length,
                removed: removed.length,
                changed: changed.length,
                layoutChanged: layoutChanged.length,
            },
            navigationOrder,
        };
        return this.cachedDiff;
    }
}

function dispatch(event: MessageType): void {
    window.dispatchEvent(new MessageEvent("message", { data: event }));
}
