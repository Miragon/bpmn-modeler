import { Command, Query, VsCodeApi } from "@miragon/bpmn-modeler-shared";
import { WebviewState } from "./vscode";

const PANEL_SCROLL_CONTAINER = ".bio-properties-panel-scroll-container";
const PANEL_GROUP = ".bio-properties-panel-group";
const PANEL_GROUP_OPEN_CLASS = "open";
const PANEL_GROUP_HEADER = ".bio-properties-panel-group-header";
const SCROLL_DEBOUNCE_MS = 100;

/**
 * Manages DMN webview state persistence and restoration across VS Code tab
 * switches.  DMN currently persists only properties-panel UI state — viewport
 * and selection round-tripping is not yet implemented for dmn-js.
 *
 * Lifecycle:
 * 1. {@link restorePanelScroll}     — after properties panel is rendered
 * 2. {@link restoreExpandedGroups}  — after properties panel is rendered
 * 3. {@link startPersisting}        — installs the change listeners
 */
export class WebviewStateManager {
    constructor(private readonly vscode: VsCodeApi<WebviewState, Command | Query>) {}

    restorePanelScroll(): void {
        const saved = this.getSavedState();
        if (saved?.panelScroll == null) {
            return;
        }
        const container = document.querySelector<HTMLElement>(PANEL_SCROLL_CONTAINER);
        if (container) {
            container.scrollTop = saved.panelScroll;
        }
    }

    /**
     * Restores expanded/collapsed group state via the library's own header
     * click handlers so Preact's internal state stays in sync.  Deferred one
     * frame so the panel has fully rendered.
     */
    restoreExpandedGroups(): void {
        const saved = this.getSavedState();
        const wanted = saved?.expandedGroupIndexes;
        if (!wanted || wanted.length === 0) {
            return;
        }
        const target = new Set(wanted);
        requestAnimationFrame(() => {
            const groups = document.querySelectorAll<HTMLElement>(PANEL_GROUP);
            groups.forEach((group, index) => {
                const isOpen = group.classList.contains(PANEL_GROUP_OPEN_CLASS);
                const shouldBeOpen = target.has(index);
                if (isOpen === shouldBeOpen) {
                    return;
                }
                const header = group.querySelector<HTMLElement>(PANEL_GROUP_HEADER);
                header?.click();
            });
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
     * Filters mutations to only those on `.bio-properties-panel-group`
     * elements — without that filter, input focus / hover class changes in
     * the panel subtree would also trigger writes.
     */
    private subscribeGroupExpansion(): void {
        const container = document.querySelector<HTMLElement>(PANEL_SCROLL_CONTAINER);
        if (!container) {
            return;
        }
        const observer = new MutationObserver((mutations) => {
            const groupChanged = mutations.some(
                (m) => m.target instanceof HTMLElement && m.target.matches(PANEL_GROUP),
            );
            if (!groupChanged) {
                return;
            }
            const groups = container.querySelectorAll<HTMLElement>(PANEL_GROUP);
            const indexes: number[] = [];
            groups.forEach((group, index) => {
                if (group.classList.contains(PANEL_GROUP_OPEN_CLASS)) {
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
