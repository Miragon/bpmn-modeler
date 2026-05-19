import { i18n } from "@miragon/bpmn-modeler-i18n";

/**
 * Minimum width (px) the properties panel can be resized to.
 * Dragging below this threshold collapses the panel entirely.
 */
const MIN_PANEL_WIDTH = 200;
// Maximum width (px) the properties panel can be dragged to.
const MAX_PANEL_WIDTH = 1600;

// CSS class applied to the panel when it is collapsed (width 0, hidden).
const COLLAPSED_CLASS = "collapsed";

// English fallback label for the toggle button, used as the translation key.
const OPEN_PANEL_LABEL = "Open properties panel";

/**
 * Chevron-left SVG used as the toggle button icon.
 * Inline so no additional icon dependency is required.
 */
const CHEVRON_LEFT_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="14" viewBox="0 0 10 14" aria-hidden="true" focusable="false">
    <path d="M7.5 2 2 7l5.5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
`;

/**
 * Public API surface exposed by {@link initResizer}.  Lets higher layers
 * (state persistence, initial-state restoration) observe and drive the
 * properties-panel visibility without touching the DOM directly.
 */
export interface PropertiesPanelHandle {
    /**
     * `true` if the panel is currently visible, `false` if collapsed.
     */
    isVisible(): boolean;

    /**
     * Programmatically show or hide the panel.  No-op when the panel is
     * already in the requested state (keeps listeners free of spurious
     * notifications).  When revealing a collapsed panel the width is set to
     * `MIN_PANEL_WIDTH * 2` so the restored panel has enough room to read
     * without immediate resizing — matching the toggle-button behaviour.
     */
    setVisible(visible: boolean): void;

    /**
     * Subscribe to visibility transitions.  Listeners are invoked with the
     * new visibility (`true` = visible) immediately after a transition, both
     * from programmatic {@link setVisible} calls and from user drag / toggle
     * interactions.  There is no unsubscribe helper because the single
     * consumer lives for the webview's entire lifetime.
     */
    onVisibilityChanged(callback: (visible: boolean) => void): void;
}

/**
 * Applies the current translation of {@link OPEN_PANEL_LABEL} to the given
 * toggle button's `aria-label` and `title` attributes.
 */
function applyToggleButtonTranslation(button: HTMLButtonElement): void {
    const label = i18n.translate(OPEN_PANEL_LABEL);
    button.setAttribute("aria-label", label);
    button.title = label;
}

/**
 * Returned when the resizer cannot find its DOM targets.  All operations on
 * this handle are no-ops so the rest of the webview can call
 * {@link PropertiesPanelHandle.setVisible} or subscribe without extra null
 * checks.  Matches the historical behaviour where the old `initResizer()`
 * silently returned after logging a warning.
 */
const NOOP_HANDLE: PropertiesPanelHandle = {
    isVisible: () => true,
    setVisible: () => undefined,
    onVisibilityChanged: () => undefined,
};

/**
 * Attaches mouse-drag listeners to the `.panel-resizer` element so the user
 * can resize the properties panel by dragging the divider, and returns a
 * {@link PropertiesPanelHandle} that exposes the panel's visibility as
 * observable state.
 *
 * Dragging left widens the panel; dragging right narrows it.
 * Width is clamped between {@link MIN_PANEL_WIDTH} and {@link MAX_PANEL_WIDTH}
 * when the panel is visible.
 *
 * When the user drags below {@link MIN_PANEL_WIDTH} the panel collapses to
 * zero width (hidden). The resizer stays visible so the user can drag it back
 * to the left to restore the panel. The panel reappears once the intended
 * width crosses {@link MIN_PANEL_WIDTH} again.
 *
 * Strategy: track the intended width in `targetWidth` (initialised once at
 * mousedown from `panel.offsetWidth`) and accumulate incremental deltas on it.
 * `panel.offsetWidth` is never read again during the drag, so the flex layout's
 * computed width cannot create a feedback loop that collapses the panel.
 * `lastX` resets every frame to ensure reversing at a clamp boundary is
 * immediately visible with no dead zone.
 */
export function initResizer(): PropertiesPanelHandle {
    const resizerEl = document.getElementById("js-panel-resizer");
    const panelEl = document.getElementById("js-properties-panel");

    if (!resizerEl || !panelEl) {
        console.warn("[resizer] Required DOM elements not found — skipping resizer init.");
        return NOOP_HANDLE;
    }

    // Re-assign after the null guard so TypeScript narrows the type for closures.
    const resizer: HTMLElement = resizerEl;
    const panel: HTMLElement = panelEl;

    let isResizing = false;
    let lastX = 0;
    // Tracks the intended width (px) independently of offsetWidth.
    let targetWidth = 0;
    /**
     * Whether the panel is currently collapsed (zero width).
     *
     * Seeded from the DOM so that when the host pre-renders the HTML with the
     * `collapsed` class (to avoid a flash of the visible panel while waiting
     * for the persisted-state round-trip), the resizer's in-memory state
     * matches the rendered state and the subsequent `setVisible(false)` call
     * from {@link main.ts} becomes a no-op.
     */
    let isCollapsed = panel.classList.contains(COLLAPSED_CLASS);

    // Subscribers notified after every visibility transition.
    const visibilityListeners: Array<(visible: boolean) => void> = [];

    /**
     * Fires all subscribers with the current visibility.  Called only from
     * {@link collapse} and {@link expand} so notifications line up one-to-one
     * with real state transitions.
     */
    function notifyVisibilityChange(): void {
        const visible = !isCollapsed;
        for (const cb of visibilityListeners) {
            try {
                cb(visible);
            } catch (error) {
                console.error("[resizer] Visibility listener threw:", error);
            }
        }
    }

    /**
     * Create the toggle button and append it to the resizer. The button is
     * hidden via CSS (`.panel-resizer-toggle` is only shown while the resizer
     * carries the `collapsed` class) so we do not need to toggle its
     * visibility from JavaScript.
     */
    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-resizer-toggle";
    button.innerHTML = CHEVRON_LEFT_SVG;
    // Prevent the click from starting a resize drag on the surrounding resizer.
    button.addEventListener("mousedown", (e: MouseEvent) => {
        e.stopPropagation();
    });
    button.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        if (!isCollapsed) {
            return;
        }
        expand();
        // Open to twice the drag-to-collapse threshold so the panel appears
        // with enough room to read its contents without immediate resizing.
        const openWidth = MIN_PANEL_WIDTH * 2;
        targetWidth = openWidth;
        panel.style.width = `${openWidth}px`;
    });
    resizer.appendChild(button);
    applyToggleButtonTranslation(button);
    i18n.onChange(() => applyToggleButtonTranslation(button));

    /**
     * Collapse the panel to zero width and mark both the panel and the resizer
     * with a CSS class. The panel hides its border and overflow; the resizer
     * becomes wider so it remains easy to grab.
     */
    function collapse(): void {
        if (isCollapsed) {
            return;
        }
        isCollapsed = true;
        panel.style.width = "0";
        panel.classList.add(COLLAPSED_CLASS);
        resizer.classList.add(COLLAPSED_CLASS);
        notifyVisibilityChange();
    }

    /**
     * Restore the panel from its collapsed state by removing the CSS class
     * from both the panel and the resizer.
     * The caller is responsible for setting the new panel width afterwards.
     */
    function expand(): void {
        if (!isCollapsed) {
            return;
        }
        isCollapsed = false;
        panel.classList.remove(COLLAPSED_CLASS);
        resizer.classList.remove(COLLAPSED_CLASS);
        notifyVisibilityChange();
    }

    /**
     * Begin a resize operation: snapshot the panel's current width as the
     * target and capture the pointer position as the delta baseline.
     * Reading `offsetWidth` only once here avoids the flex feedback loop during
     * the drag.
     */
    resizer.addEventListener("mousedown", (e: MouseEvent) => {
        isResizing = true;
        lastX = e.clientX;
        // When collapsed the panel has zero offsetWidth — start from 0 so the
        // user must drag past MIN_PANEL_WIDTH to uncollapse.
        targetWidth = isCollapsed ? 0 : panel.offsetWidth;

        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    });

    /**
     * Update the panel width as the pointer moves.
     *
     * Moving left (positive delta) increases the panel width because the panel
     * is on the right side of the canvas. `targetWidth` is allowed to go all
     * the way down to 0 so the collapse/expand logic can use
     * {@link MIN_PANEL_WIDTH} as the snap threshold:
     *
     * - Below MIN_PANEL_WIDTH and dragging right → panel collapses.
     * - Below MIN_PANEL_WIDTH, collapsed, and dragging left → panel appears
     *   immediately at MIN_PANEL_WIDTH (preview). It stays at that width until
     *   targetWidth catches up and exceeds MIN_PANEL_WIDTH.
     * - At or above MIN_PANEL_WIDTH → panel is visible at `targetWidth`.
     *
     * `lastX` resets every frame so reversing at a boundary takes effect
     * immediately with no dead zone.
     */
    document.addEventListener("mousemove", (e: MouseEvent) => {
        if (!isResizing) {
            return;
        }

        const delta = lastX - e.clientX;
        lastX = e.clientX;
        targetWidth = Math.max(0, Math.min(MAX_PANEL_WIDTH, targetWidth + delta));

        if (targetWidth < MIN_PANEL_WIDTH) {
            if (isCollapsed && targetWidth > 0) {
                /**
                 * Any accumulated leftward drag from collapsed state — reveal the
                 * panel at minimum width immediately. targetWidth keeps accumulating
                 * naturally; the panel stays at MIN_PANEL_WIDTH until it catches up.
                 */
                expand();
                panel.style.width = `${MIN_PANEL_WIDTH}px`;
            } else if (!isCollapsed && targetWidth <= 0) {
                /**
                 * User dragged all the way back to the starting point — collapse.
                 */
                collapse();
            }
        } else {
            if (isCollapsed) {
                expand();
            }
            panel.style.width = `${targetWidth}px`;
        }
    });

    // End the resize operation and restore default pointer behaviour.
    document.addEventListener("mouseup", () => {
        if (!isResizing) {
            return;
        }

        isResizing = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
    });

    return {
        isVisible: () => !isCollapsed,
        setVisible: (visible: boolean) => {
            if (visible === !isCollapsed) {
                return;
            }
            if (visible) {
                expand();
                const openWidth = MIN_PANEL_WIDTH * 2;
                targetWidth = openWidth;
                panel.style.width = `${openWidth}px`;
            } else {
                collapse();
            }
        },
        onVisibilityChanged: (callback) => {
            visibilityListeners.push(callback);
        },
    };
}
