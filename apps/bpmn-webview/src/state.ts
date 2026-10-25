/**
 * Host-adapter surface — `WebviewStateManager` speaks the private Query/Command
 * protocol and persists panel/canvas UI state. Lives in the app, outside the
 * publishable `@miragon/bpmn-modeler` boundary.
 */
import {
    Command,
    createWebviewStateStore,
    HostApi,
    PropertiesPanelHandle,
    PropertiesPanelUiStateAdapter,
    Query,
    type WebviewStateStore,
} from "@miragon/bpmn-modeler-shared";
import { isUsableViewbox, type SurfaceMode } from "@miragon/bpmn-modeler-types";
import { CanvasViewState, WebviewState } from "./webviewState";
import type { BpmnModelerHandle } from "@miragon/bpmn-modeler";

/**
 * The structural subset of a surface handle {@link WebviewStateManager} drives —
 * viewport/selection/plane accessors and the view-state composition. Every
 * surface (modeler, designer, viewer) satisfies it, so the manager binds to any
 * of them without knowing which is live.
 */
type StatefulSurface = Pick<
    BpmnModelerHandle,
    "viewport" | "selection" | "rootElement" | "captureViewState" | "applyViewState"
>;

/**
 * Reads this editor's persisted surface mode without a full
 * {@link WebviewStateManager}. Returns `undefined` when no mode is saved yet
 * (first-ever open), so the caller falls back to the host default; read before
 * surface construction, like the shared `readSavedPanelVisibility`.
 */
export function readSavedMode(
    host: HostApi<WebviewState, Command | Query>,
): SurfaceMode | undefined {
    return host.getState()?.mode;
}

/**
 * Lifecycle phases (call in order):
 * 1. {@link restoreViewport}       — after importXML (canvas must exist)
 * 2. {@link restoreSelection}      — after element templates + settings applied
 * 3. {@link restorePanelUiState}   — after properties panel is rendered
 * 4. {@link startPersisting}       — subscribes to change events
 *
 * Panel visibility is handled out-of-band via {@link restorePanelVisibility}
 * (saved-wins-over-host-default) and {@link persistPanelVisibility}.
 *
 * For mid-session re-imports (undo/redo, XML push, language switch), use
 * {@link captureViewState} / {@link applyViewState} to snapshot and
 * restore the drill-down plane, viewbox, and selection.
 */
export class WebviewStateManager {
    private readonly stateStore: WebviewStateStore<WebviewState>;

    private readonly panelUiState: PropertiesPanelUiStateAdapter;

    constructor(
        host: HostApi<WebviewState, Command | Query>,
        // Any of the three surfaces (modeler / designer / viewer) — bound
        // structurally so the manager rebinds on every mode switch.
        private readonly modeler: StatefulSurface,
        panelRoot: HTMLElement,
    ) {
        this.stateStore = createWebviewStateStore(host);
        this.panelUiState = new PropertiesPanelUiStateAdapter(this.stateStore, panelRoot);
    }

    /**
     * Persists this editor's surface mode so a later tab-switch rebuild reopens
     * in the same mode. The single writer is the session's mode controller.
     */
    persistMode(mode: SurfaceMode): void {
        this.stateStore.merge({ mode });
    }

    /**
     * Must be called after importXML — the canvas does not exist before that.
     *
     * A saved viewbox only exists after a tab-switch rebuild (VS Code retains
     * `getState()`); a fresh open/reopen starts with empty state and keeps the
     * fit the surface armed on import. A restore while the host has not laid
     * the canvas out yet is held by the surface and applied once it has a size.
     */
    restoreViewport(): void {
        const saved = this.stateStore.read();

        // Restore the drill-down plane before the viewbox — viewbox
        // coordinates are plane-relative, and applying them against the
        // wrong root would pan to a nonsensical position. If the
        // sub-process no longer exists (removed by an undo before the
        // tab was revisited), setRootElementById returns false and the
        // canvas stays on the top-level process root.
        if (saved?.rootElementId) {
            this.modeler.rootElement.setRootElementById(saved.rootElementId);
        }

        if (saved?.viewport) {
            this.modeler.viewport.setViewport(saved.viewport);
        }
    }

    /**
     * Must be called after element templates and settings have been applied
     * so their side-effects do not clear the restored selection.
     */
    restoreSelection(): void {
        const saved = this.stateStore.read();
        if (saved?.selectedElementIds && saved.selectedElementIds.length > 0) {
            this.modeler.selection.selectElementsByIds(saved.selectedElementIds);
        }
    }

    /**
     * This editor's saved visibility wins; only when absent does the caller's
     * `fallbackVisible` (the host's global default) apply.
     */
    restorePanelVisibility(handle: PropertiesPanelHandle, fallbackVisible: boolean): void {
        this.panelUiState.restorePanelVisibility(handle, fallbackVisible);
    }

    persistPanelVisibility(visible: boolean): void {
        this.panelUiState.persistPanelVisibility(visible);
    }

    /** Must be called after the resizer has made the panel visible. */
    restorePanelUiState(): void {
        this.panelUiState.restoreGroupsAndScroll();
    }

    /**
     * Writes the current viewport to persisted state immediately, bypassing the
     * 100 ms debounce in {@link ViewportManager.onViewportChanged}. Called on
     * `visibilitychange → hidden` so a tab switch right after a gesture does
     * not lose the last position.
     */
    flushViewport(): void {
        const viewport = this.modeler.viewport.getViewport();
        if (isUsableViewbox(viewport)) {
            // Persist the drill-down plane alongside the viewbox — a viewbox
            // captured inside a sub-process plane is meaningless against the
            // top-level plane on restore. `getRootElementId` already returns
            // `undefined` for the implicit root, so implicit ids are never saved.
            this.stateStore.merge({
                viewport,
                rootElementId: this.modeler.rootElement.getRootElementId(),
            });
        }
    }

    startPersisting(): void {
        this.modeler.rootElement.onRootChanged((rootElementId) => {
            this.stateStore.merge({ rootElementId });
        });

        this.modeler.viewport.onViewportChanged((viewport) => {
            this.stateStore.merge({ viewport });
        });

        this.modeler.selection.onSelectionChanged((selectedElementIds) => {
            this.stateStore.merge({ selectedElementIds });
        });

        this.panelUiState.startPersisting();
    }

    /**
     * Snapshots the live canvas state — drill-down plane, viewbox, and
     * selection — so it can be re-applied after a destructive re-import
     * (undo/redo host push, language switch). Delegates to the package handle,
     * which owns the composition (root → viewport → selection ordering).
     */
    captureViewState(): CanvasViewState {
        return this.modeler.captureViewState();
    }

    /**
     * Re-applies a previously captured view state after a re-import. The handle
     * enforces the required order: root first (viewbox coordinates are
     * plane-relative), then viewbox, then selection.
     */
    applyViewState(snapshot: CanvasViewState): void {
        this.modeler.applyViewState(snapshot);
    }
}
