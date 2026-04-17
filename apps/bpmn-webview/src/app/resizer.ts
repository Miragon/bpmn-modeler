/**
 * Minimum width (px) the properties panel can be resized to.
 * Dragging below this threshold collapses the panel entirely.
 */
const MIN_PANEL_WIDTH = 200;
/** Maximum width (px) the properties panel can be dragged to. */
const MAX_PANEL_WIDTH = 1600;

/** CSS class applied to the panel when it is collapsed (width 0, hidden). */
const COLLAPSED_CLASS = "collapsed";

/** English fallback label for the toggle button, used as the translation key. */
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
 * Holds references to the toggle button and a translate function so the label
 * can be refreshed when the user switches language after init.
 */
let toggleButton: HTMLButtonElement | undefined;
let translateFn: (key: string) => string = (key) => key;

/**
 * Applies the current translation to the toggle button's `aria-label` and
 * `title` attributes. Safe to call before the button has been created.
 */
function applyToggleButtonTranslation(): void {
    if (!toggleButton) {
        return;
    }
    const label = translateFn(OPEN_PANEL_LABEL);
    toggleButton.setAttribute("aria-label", label);
    toggleButton.title = label;
}

/**
 * Registers the translate function used for the toggle button's accessible
 * label and tooltip. Call this once the bpmn-js DI container is ready, and
 * again after every language switch to refresh the label.
 */
export function setResizerTranslate(translate: (key: string) => string): void {
    translateFn = translate;
    applyToggleButtonTranslation();
}

/**
 * Attaches mouse-drag listeners to the `.panel-resizer` element so the user
 * can resize the properties panel by dragging the divider.
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
export function initResizer(): void {
    const resizerEl = document.getElementById("js-panel-resizer");
    const panelEl = document.getElementById("js-properties-panel");

    if (!resizerEl || !panelEl) {
        console.warn("[resizer] Required DOM elements not found — skipping resizer init.");
        return;
    }

    // Re-assign after the null guard so TypeScript narrows the type for closures.
    const resizer: HTMLElement = resizerEl;
    const panel: HTMLElement = panelEl;

    let isResizing = false;
    let lastX = 0;
    /** Tracks the intended width (px) independently of offsetWidth. */
    let targetWidth = 0;
    /** Whether the panel is currently collapsed (zero width). */
    let isCollapsed = false;

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
    toggleButton = button;
    applyToggleButtonTranslation();

    /**
     * Collapse the panel to zero width and mark both the panel and the resizer
     * with a CSS class. The panel hides its border and overflow; the resizer
     * becomes wider so it remains easy to grab.
     */
    function collapse(): void {
        isCollapsed = true;
        panel.style.width = "0";
        panel.classList.add(COLLAPSED_CLASS);
        resizer.classList.add(COLLAPSED_CLASS);
    }

    /**
     * Restore the panel from its collapsed state by removing the CSS class
     * from both the panel and the resizer.
     * The caller is responsible for setting the new panel width afterwards.
     */
    function expand(): void {
        isCollapsed = false;
        panel.classList.remove(COLLAPSED_CLASS);
        resizer.classList.remove(COLLAPSED_CLASS);
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
                // Any accumulated leftward drag from collapsed state — reveal the
                // panel at minimum width immediately. targetWidth keeps accumulating
                // naturally; the panel stays at MIN_PANEL_WIDTH until it catches up.
                expand();
                panel.style.width = `${MIN_PANEL_WIDTH}px`;
            } else if (!isCollapsed && targetWidth <= 0) {
                // User dragged all the way back to the starting point — collapse.
                collapse();
            }
        } else {
            if (isCollapsed) {
                expand();
            }
            panel.style.width = `${targetWidth}px`;
        }
    });

    /** End the resize operation and restore default pointer behaviour. */
    document.addEventListener("mouseup", () => {
        if (!isResizing) {
            return;
        }

        isResizing = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
    });
}
