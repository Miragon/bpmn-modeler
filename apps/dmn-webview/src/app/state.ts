import { Command, Query, VsCodeApi } from "@miragon/bpmn-modeler-shared";
import { WebviewState } from "./vscode";

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
 * Manages DMN webview state persistence and restoration across VS Code tab
 * switches.  DMN currently persists only properties-panel UI state — viewport
 * and selection round-tripping is not yet implemented for dmn-js.
 *
 * Lifecycle:
 * 1. {@link restorePanelUiState}   — after properties panel is rendered
 * 2. {@link startPersisting}       — installs the change listeners
 */
export class WebviewStateManager {
    constructor(private readonly vscode: VsCodeApi<WebviewState, Command | Query>) {}

    /**
     * Restores the properties-panel UI state (expanded groups + scroll) in a
     * single coordinated pass.  Order matters: groups are toggled first, then
     * scroll is applied on a follow-up frame so Preact has flushed the
     * click-induced re-renders.  Applying scroll before expansion would clamp
     * to a smaller scrollHeight.
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
                requestAnimationFrame(() => {
                    container.scrollTop = savedScroll;
                });
            }
        });
    }

    startPersisting(): void {
        this.subscribePanelScroll();
        this.subscribeGroupExpansion();
    }

    private getSavedState(): WebviewState | undefined {
        try {
            return this.vscode.getState();
        } catch {
            return undefined;
        }
    }

    private persistPartialState(partial: Partial<WebviewState>): void {
        try {
            this.vscode.updateState(partial);
        } catch {
            this.vscode.setState(partial as WebviewState);
        }
    }

    /**
     * Wires a debounced scroll listener on the properties panel.
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
