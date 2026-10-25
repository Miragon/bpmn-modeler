import type { PropertiesPanelHandle } from "./propertiesPanelResizer";
import type { WebviewStateHost, WebviewStateStore } from "./webviewStateStore";

/** Per-editor properties-panel UI state that survives a tab-switch rebuild. */
export interface PropertiesPanelUiState {
    panelScroll?: number;
    /**
     * Positional rather than by label, so it survives a language switch. Absent
     * until a group header first changes; an empty list means no group was open.
     */
    expandedGroupIndexes?: number[];
    /** Absent until the user first toggles the panel; the host's global default applies until then. */
    panelVisible?: boolean;
}

export function resolvePanelVisibility(
    saved: PropertiesPanelUiState | undefined,
    hostDefaultVisible: boolean,
): boolean {
    return saved?.panelVisible ?? hostDefaultVisible;
}

export function hasGroupsOrScrollToRestore(
    saved: PropertiesPanelUiState | undefined,
): saved is PropertiesPanelUiState {
    return saved?.expandedGroupIndexes != null || saved?.panelScroll != null;
}

/** Without a saved list the panel keeps its own default expansion. */
export function groupIndexesToToggle(
    openGroups: readonly boolean[],
    expandedGroupIndexes: readonly number[] | undefined,
): number[] {
    if (!expandedGroupIndexes) {
        return [];
    }
    const wanted = new Set(expandedGroupIndexes);
    return openGroups.flatMap((isOpen, index) => (isOpen === wanted.has(index) ? [] : [index]));
}

export function openGroupIndexes(openGroups: readonly boolean[]): number[] {
    return openGroups.flatMap((isOpen, index) => (isOpen ? [index] : []));
}

export function readSavedPanelVisibility(
    host: WebviewStateHost<PropertiesPanelUiState>,
): boolean | undefined {
    return host.getState()?.panelVisible;
}

const PANEL_SCROLL_CONTAINER = ".bio-properties-panel-scroll-container";
const PANEL_GROUP = ".bio-properties-panel-group";
const PANEL_GROUP_HEADER = ".bio-properties-panel-group-header";
const PANEL_GROUP_OPEN_CLASS = "open";
const SCROLL_DEBOUNCE_MS = 100;

function groupHeader(group: HTMLElement): HTMLElement | null {
    return group.querySelector<HTMLElement>(PANEL_GROUP_HEADER);
}

/**
 * `@bpmn-io/properties-panel` sets `open` on the header only, and the group
 * body differs between regular and list groups, so the header is the one
 * element that reliably tracks expansion.
 */
function isGroupOpen(group: HTMLElement): boolean {
    return groupHeader(group)?.classList.contains(PANEL_GROUP_OPEN_CLASS) ?? false;
}

/**
 * Binds {@link PropertiesPanelUiState} to a rendered `@bpmn-io/properties-panel`.
 * Lookups stay inside `panelRoot` so a second modeler's panel on the same page
 * is never mistaken for this one's.
 */
export class PropertiesPanelUiStateAdapter {
    constructor(
        private readonly store: WebviewStateStore<PropertiesPanelUiState>,
        private readonly panelRoot: HTMLElement,
        private readonly scheduleFrame: (callback: () => void) => void = (callback) =>
            requestAnimationFrame(callback),
    ) {}

    /** Through the resizer handle: it seeds `isCollapsed` from the DOM and would desync otherwise. */
    restorePanelVisibility(handle: PropertiesPanelHandle, hostDefaultVisible: boolean): void {
        handle.setVisible(resolvePanelVisibility(this.store.read(), hostDefaultVisible));
    }

    persistPanelVisibility(visible: boolean): void {
        this.store.merge({ panelVisible: visible });
    }

    /**
     * Must run once the panel is rendered. Scroll waits one more frame so Preact
     * has committed the expanded groups; earlier it would clamp to the shorter
     * scroll height.
     */
    restoreGroupsAndScroll(): void {
        const saved = this.store.read();
        if (!hasGroupsOrScrollToRestore(saved)) {
            return;
        }
        this.scheduleFrame(() => {
            const container = this.scrollContainer();
            if (!container) {
                return;
            }
            const groups = this.groupsIn(container);
            const togglesNeeded = groupIndexesToToggle(
                groups.map(isGroupOpen),
                saved.expandedGroupIndexes,
            );
            for (const index of togglesNeeded) {
                groupHeader(groups[index])?.click();
            }
            const savedScroll = saved.panelScroll;
            if (savedScroll != null) {
                this.scheduleFrame(() => {
                    container.scrollTop = savedScroll;
                });
            }
        });
    }

    startPersisting(): void {
        const container = this.scrollContainer();
        if (!container) {
            return;
        }
        this.persistScrollDebounced(container);
        this.persistGroupExpansion(container);
    }

    private scrollContainer(): HTMLElement | null {
        return this.panelRoot.querySelector<HTMLElement>(PANEL_SCROLL_CONTAINER);
    }

    private groupsIn(container: HTMLElement): HTMLElement[] {
        return Array.from(container.querySelectorAll<HTMLElement>(PANEL_GROUP));
    }

    /** Every wheel pixel emits a scroll event, and each persist is a synchronous host storage write. */
    private persistScrollDebounced(container: HTMLElement): void {
        let timer: ReturnType<typeof setTimeout> | undefined;
        container.addEventListener("scroll", () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                this.store.merge({ panelScroll: container.scrollTop });
            }, SCROLL_DEBOUNCE_MS);
        });
    }

    /**
     * The panel exposes no expand/collapse event, so header class mutations are
     * the signal; other class changes in the subtree (focus, hover) are ignored.
     */
    private persistGroupExpansion(container: HTMLElement): void {
        const observer = new MutationObserver((mutations) => {
            const headerToggled = mutations.some(
                (mutation) =>
                    mutation.target instanceof HTMLElement &&
                    mutation.target.matches(PANEL_GROUP_HEADER),
            );
            if (!headerToggled) {
                return;
            }
            this.store.merge({
                expandedGroupIndexes: openGroupIndexes(this.groupsIn(container).map(isGroupOpen)),
            });
        });
        observer.observe(container, {
            subtree: true,
            attributes: true,
            attributeFilter: ["class"],
        });
    }
}
