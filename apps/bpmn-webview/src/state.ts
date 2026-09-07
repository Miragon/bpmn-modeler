/**
 * Host-adapter surface — `WebviewStateManager` speaks the private Query/Command
 * protocol and persists panel/canvas UI state. Lives in the app, outside the
 * publishable `@miragon/bpmn-modeler` boundary.
 */
import {
    Command,
    Query,
    HostApi,
    PropertiesPanelHandle,
    type SurfaceMode,
} from "@miragon/bpmn-modeler-shared";
import { isUsableViewbox } from "@miragon/bpmn-modeler-types";
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

const PANEL_SCROLL_CONTAINER = ".bio-properties-panel-scroll-container";
const PANEL_GROUP = ".bio-properties-panel-group";
const PANEL_GROUP_HEADER = ".bio-properties-panel-group-header";
const PANEL_GROUP_OPEN_CLASS = "open";
const SCROLL_DEBOUNCE_MS = 100;

/**
 * `@bpmn-io/properties-panel` puts the `open` class on the header child,
 * never on the group root — and the body element differs between regular
 * groups (`.bio-properties-panel-group-entries`) and list groups
 * (`.bio-properties-panel-list`). The header is the only element common to
 * both that reliably tracks expansion state.
 */
function isGroupOpen(group: HTMLElement): boolean {
    const header = group.querySelector<HTMLElement>(PANEL_GROUP_HEADER);
    return header?.classList.contains(PANEL_GROUP_OPEN_CLASS) ?? false;
}

/**
 * Reads the per-editor properties-panel visibility from persisted state without
 * needing a full {@link WebviewStateManager}. Returns `undefined` when this
 * editor has no saved entry yet (so the caller falls back to the host's global
 * default); used for the pre-import early-apply before the modeler exists.
 */
export function readSavedPanelVisibility(
    host: HostApi<WebviewState, Command | Query>,
): boolean | undefined {
    try {
        return host.getState()?.panelVisible;
    } catch {
        return undefined;
    }
}

/**
 * Reads this editor's persisted surface mode without a full
 * {@link WebviewStateManager}. Returns `undefined` when no mode is saved yet
 * (first-ever open), so the caller falls back to the host default; read before
 * surface construction, like {@link readSavedPanelVisibility}.
 */
export function readSavedMode(
    host: HostApi<WebviewState, Command | Query>,
): SurfaceMode | undefined {
    try {
        return host.getState()?.mode;
    } catch {
        return undefined;
    }
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
    /** Latches once {@link restoreViewport} has applied a viewbox. */
    private viewportRestored = false;

    constructor(
        private readonly host: HostApi<WebviewState, Command | Query>,
        // Any of the three surfaces (modeler / designer / viewer) — bound
        // structurally so the manager rebinds on every mode switch.
        private readonly modeler: StatefulSurface,
        // The properties-panel host element. The scroll container is looked up
        // within it rather than via `document` so a second modeler's panel on
        // the same page is never mistaken for this one's.
        private readonly panelRoot: HTMLElement,
    ) {}

    /**
     * Persists this editor's surface mode so a later tab-switch rebuild reopens
     * in the same mode. The single writer is bootstrap's mode session.
     */
    persistMode(mode: SurfaceMode): void {
        this.persistPartialState({ mode });
    }

    /**
     * Must be called after importXML — the canvas does not exist before that.
     *
     * A saved viewbox only exists after a tab-switch rebuild (VS Code retains
     * `getState()`); a fresh open/reopen starts with empty state. So the
     * absence of a saved viewport discriminates a genuine fresh open, where we
     * fit the diagram — bpmn-js leaves the canvas at the origin on importXML,
     * which renders a diagram moved far from the origin off-screen.
     *
     * Safe to call repeatedly: nothing happens until the host has laid the
     * canvas out, and then it applies exactly once — re-fitting on every later
     * resize would discard the zoom the user chose.
     *
     * @returns `true` once a viewbox has been applied, `false` while the
     *   caller should keep retrying.
     */
    restoreViewport(): boolean {
        if (this.viewportRestored) {
            return true;
        }

        const saved = this.getSavedState();

        // Restore the drill-down plane before the viewbox — viewbox
        // coordinates are plane-relative, and applying them against the
        // wrong root would pan to a nonsensical position. If the
        // sub-process no longer exists (removed by an undo before the
        // tab was revisited), setRootElementById returns false and the
        // canvas stays on the top-level process root.
        if (saved?.rootElementId) {
            this.modeler.rootElement.setRootElementById(saved.rootElementId);
        }

        this.viewportRestored = saved?.viewport
            ? this.modeler.viewport.setViewport(saved.viewport)
            : this.modeler.viewport.fitViewport();
        return this.viewportRestored;
    }

    /**
     * Must be called after element templates and settings have been applied
     * so their side-effects do not clear the restored selection.
     */
    restoreSelection(): void {
        const saved = this.getSavedState();
        if (saved?.selectedElementIds && saved.selectedElementIds.length > 0) {
            this.modeler.selection.selectElementsByIds(saved.selectedElementIds);
        }
    }

    /**
     * Applies the per-editor panel visibility through the resizer handle: this
     * editor's saved entry wins, and only when it is absent does the caller's
     * `fallbackVisible` (the host's global default) apply. Must be driven via the
     * handle rather than raw DOM manipulation — the resizer seeds `isCollapsed`
     * from the DOM and would otherwise desync.
     */
    restorePanelVisibility(handle: PropertiesPanelHandle, fallbackVisible: boolean): void {
        handle.setVisible(this.getSavedState()?.panelVisible ?? fallbackVisible);
    }

    /**
     * Persists this editor's panel visibility so a later tab-switch rebuild
     * restores it independently of the host's global default.
     */
    persistPanelVisibility(visible: boolean): void {
        this.persistPartialState({ panelVisible: visible });
    }

    /**
     * Must be called after the resizer has made the panel visible — the
     * scroll container does not exist in the DOM before then.
     *
     * Order matters: groups are toggled first, then scroll is applied on a
     * follow-up frame so Preact has flushed the click-induced re-renders.
     * Applying scroll before expansion would clamp to a smaller scrollHeight.
     */
    restorePanelUiState(): void {
        const saved = this.getSavedState();
        if (!saved) {
            return;
        }
        const wanted = saved.expandedGroupIndexes;
        const savedScroll = saved.panelScroll;
        if ((!wanted || wanted.length === 0) && savedScroll == null) {
            return;
        }
        requestAnimationFrame(() => {
            const container = this.panelRoot.querySelector<HTMLElement>(PANEL_SCROLL_CONTAINER);
            if (!container) {
                return;
            }
            if (wanted && wanted.length > 0) {
                const target = new Set(wanted);
                const groups = container.querySelectorAll<HTMLElement>(PANEL_GROUP);
                groups.forEach((group, index) => {
                    const shouldBeOpen = target.has(index);
                    if (isGroupOpen(group) === shouldBeOpen) {
                        return;
                    }
                    const header = group.querySelector<HTMLElement>(PANEL_GROUP_HEADER);
                    header?.click();
                });
            }
            if (savedScroll != null) {
                /**
                 * Second rAF waits for Preact to commit the click-induced
                 * re-renders; only then has scrollHeight grown to fit the
                 * restored open groups so scrollTop lands where the user left it.
                 */
                requestAnimationFrame(() => {
                    container.scrollTop = savedScroll;
                });
            }
        });
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
            this.persistPartialState({
                viewport,
                rootElementId: this.modeler.rootElement.getRootElementId(),
            });
        }
    }

    startPersisting(): void {
        this.modeler.rootElement.onRootChanged((rootElementId) => {
            this.persistPartialState({ rootElementId });
        });

        this.modeler.viewport.onViewportChanged((viewport) => {
            this.persistPartialState({ viewport });
        });

        this.modeler.selection.onSelectionChanged((selectedElementIds) => {
            this.persistPartialState({ selectedElementIds });
        });

        this.subscribePanelScroll();
        this.subscribeGroupExpansion();
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

    private getSavedState(): WebviewState | undefined {
        try {
            return this.host.getState();
        } catch {
            return undefined;
        }
    }

    /**
     * Falls back to a full `setState` when no prior state exists.
     */
    private persistPartialState(partial: Partial<WebviewState>): void {
        try {
            this.host.updateState(partial);
        } catch {
            this.host.setState(partial as WebviewState);
        }
    }

    /**
     * Debounced because each pixel of mouse-wheel scroll emits an event and
     * `setState` synchronously writes to VS Code workspace storage.
     */
    private subscribePanelScroll(): void {
        const container = this.panelRoot.querySelector<HTMLElement>(PANEL_SCROLL_CONTAINER);
        if (!container) {
            return;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        container.addEventListener("scroll", () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                this.persistPartialState({ panelScroll: container.scrollTop });
            }, SCROLL_DEBOUNCE_MS);
        });
    }

    /**
     * The library exposes no public event for expand/collapse toggles, so a
     * MutationObserver on the group header `class` attribute is the only
     * reliable signal. Other class mutations (input focus, hover, …) are
     * discarded by filtering for `.bio-properties-panel-group-header`.
     */
    private subscribeGroupExpansion(): void {
        const container = this.panelRoot.querySelector<HTMLElement>(PANEL_SCROLL_CONTAINER);
        if (!container) {
            return;
        }
        const observer = new MutationObserver((mutations) => {
            const groupChanged = mutations.some(
                (m) => m.target instanceof HTMLElement && m.target.matches(PANEL_GROUP_HEADER),
            );
            if (!groupChanged) {
                return;
            }
            const groups = container.querySelectorAll<HTMLElement>(PANEL_GROUP);
            const indexes: number[] = [];
            groups.forEach((group, index) => {
                if (isGroupOpen(group)) {
                    indexes.push(index);
                }
            });
            this.persistPartialState({ expandedGroupIndexes: indexes });
        });
        observer.observe(container, {
            subtree: true,
            attributes: true,
            attributeFilter: ["class"],
        });
    }
}
