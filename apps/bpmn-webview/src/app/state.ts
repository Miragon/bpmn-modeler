import { Command, Query, VsCodeApi } from "@miragon/bpmn-modeler-shared";
import { WebviewState } from "./vscode";
import { BpmnModeler } from "./modeler";

const PANEL_SCROLL_CONTAINER = ".bio-properties-panel-scroll-container";
const PANEL_GROUP = ".bio-properties-panel-group";
const PANEL_GROUP_HEADER = ".bio-properties-panel-group-header";
const PANEL_GROUP_OPEN_CLASS = "open";
const SCROLL_DEBOUNCE_MS = 100;

/**
 * Returns whether the given properties-panel group is currently expanded.
 *
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
 * Manages webview state persistence and restoration across VS Code tab switches.
 *
 * Lifecycle phases (call in order):
 * 1. {@link restoreViewport}       — after importXML (canvas must exist)
 * 2. {@link restoreSelection}      — after element templates + settings applied
 * 3. {@link restorePanelUiState}   — after properties panel is rendered
 * 4. {@link startPersisting}       — subscribes to change events for ongoing persistence
 */
export class WebviewStateManager {
    constructor(
        private readonly vscode: VsCodeApi<WebviewState, Command | Query>,
        private readonly modeler: BpmnModeler,
    ) {}

    /**
     * Restores the saved viewport (pan/zoom) if one exists in webview state.
     * Must be called after importXML because the canvas does not exist before that.
     */
    restoreViewport(): void {
        const saved = this.getSavedState();
        if (saved?.viewport) {
            this.modeler.viewport.setViewport(saved.viewport);
        }
    }

    /**
     * Restores the saved element selection if one exists in webview state.
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
     * Restores the properties-panel UI state (expanded groups + scroll) in a
     * single coordinated pass.  Must be called after the resizer has made
     * the panel visible so the scroll container exists in the DOM.
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
            const container = document.querySelector<HTMLElement>(PANEL_SCROLL_CONTAINER);
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
                // Second rAF waits for Preact to commit the click-induced
                // re-renders; only then has scrollHeight grown to fit the
                // restored open groups so scrollTop lands where the user left it.
                requestAnimationFrame(() => {
                    container.scrollTop = savedScroll;
                });
            }
        });
    }

    /**
     * Subscribes to viewport, selection, scroll, and group-expansion changes
     * and persists them to webview state so they survive the next tab switch.
     */
    startPersisting(): void {
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
     * Reads previously saved webview state, returning `undefined` when no
     * state has been set yet (first open).
     */
    private getSavedState(): WebviewState | undefined {
        try {
            return this.vscode.getState();
        } catch {
            return undefined;
        }
    }

    /**
     * Merges a partial update into the persisted webview state.
     * Falls back to a full `setState` when no prior state exists.
     *
     * @param partial The state fields to persist.
     */
    private persistPartialState(partial: Partial<WebviewState>): void {
        try {
            this.vscode.updateState(partial);
        } catch {
            this.vscode.setState(partial as WebviewState);
        }
    }

    /**
     * Wires a debounced scroll listener on the properties panel.  Debounced
     * because each pixel of mouse-wheel scroll emits an event; setState
     * synchronously writes to VS Code's workspace storage.
     */
    private subscribePanelScroll(): void {
        const container = document.querySelector<HTMLElement>(PANEL_SCROLL_CONTAINER);
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
     * Wires a MutationObserver on group `class` attributes so expand /
     * collapse toggles (which the library does via internal Preact state, no
     * public event) are mirrored into persisted state.
     *
     * The `open` class lives on the header child of each group, not on the
     * group root, so the filter only accepts class mutations on
     * `.bio-properties-panel-group-header` — discarding unrelated class
     * changes elsewhere in the panel subtree (input focus, hover, etc.).
     */
    private subscribeGroupExpansion(): void {
        const container = document.querySelector<HTMLElement>(PANEL_SCROLL_CONTAINER);
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
