/**
 * @internal Page-level webview chrome coupled to the `js-properties-panel` DOM
 * id and the panel shortcuts. Not part of the designed public API (#1375).
 * `isTextEditingSurface` is the one broadly-reused helper here.
 */
import type { PropertiesPanelHandle } from "./propertiesPanelResizer";

/**
 * True when the element is a text-editing surface where single-character
 * keystrokes must type rather than trigger shortcuts.
 */
export function isTextEditingSurface(el: Element | null): boolean {
    if (el instanceof HTMLInputElement) return true;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLElement && el.contentEditable === "true") return true;
    return false;
}

export interface PanelFocusOptions {
    /** Override the panel root lookup (default: `getElementById("js-properties-panel")`). */
    getPanelRoot?: () => HTMLElement | null;
    /**
     * Scheduling primitive injected for testability.
     * Default: `requestAnimationFrame`. Pass a synchronous thunk runner in specs.
     */
    schedule?: (cb: () => void) => void;
}

/**
 * CSS selector matching focusable fields inside the properties panel.
 * Buttons are included so an all-groups-collapsed panel can focus the
 * first group-header toggle.
 */
const FOCUSABLE =
    'input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
    'textarea:not([disabled]), [contenteditable="true"], button:not([disabled])';

function getPanelRoot(opts?: PanelFocusOptions): HTMLElement | null {
    return opts?.getPanelRoot
        ? opts.getPanelRoot()
        : document.getElementById("js-properties-panel");
}

function schedule(cb: () => void, opts?: PanelFocusOptions): void {
    (opts?.schedule ?? requestAnimationFrame)(cb);
}

/**
 * Focuses the first interactive field inside the properties panel,
 * expanding it first when collapsed. One scheduling frame is inserted
 * before focusing so the Preact commit that renders the panel contents
 * after expand has settled — the same timing trick
 * `WebviewStateManager.restorePanelUiState` uses.
 */
export function focusPropertiesPanel(
    handle: PropertiesPanelHandle,
    opts?: PanelFocusOptions,
): void {
    const panel = getPanelRoot(opts);
    if (!panel || panel.childElementCount === 0) return;

    if (!handle.isVisible()) {
        handle.setVisible(true);
    }

    schedule(() => {
        const scrollContainer =
            panel.querySelector<HTMLElement>(".bio-properties-panel-scroll-container") ?? panel;
        const candidates = scrollContainer.querySelectorAll<HTMLElement>(FOCUSABLE);

        // Prefer the first *visible* candidate; fall back to the first one
        // regardless (jsdom always reports offsetParent === null, so the
        // fallback keeps specs deterministic).
        const visible = Array.from(candidates).find((el) => el.offsetParent !== null);
        const target = visible ?? candidates[0];

        if (target) {
            target.focus();
        } else {
            scrollContainer.tabIndex = -1;
            scrollContainer.focus();
        }
    }, opts);
}

/**
 * Toggles panel visibility. When collapsing with focus inside the panel,
 * moves focus back to the canvas so it is not stranded in a zero-width
 * container. Expanding does not move focus — `p` is the focus verb.
 */
export function togglePropertiesPanel(
    handle: PropertiesPanelHandle,
    focusCanvas: () => void,
    opts?: PanelFocusOptions,
): void {
    if (handle.isVisible()) {
        const panel = getPanelRoot(opts);
        const hadFocusInside = panel?.contains(document.activeElement) ?? false;
        handle.setVisible(false);
        if (hadFocusInside) focusCanvas();
    } else {
        handle.setVisible(true);
    }
}

export interface PanelShortcutDeps {
    handle: PropertiesPanelHandle;
    focusCanvas: () => void;
    isCanvasFocused: () => boolean;
    /** DMN: false outside DRD view — disables all three shortcuts. */
    isEnabled?: () => boolean;
    /** When true, Escape inside the panel moves focus to the canvas (DMN only). */
    escapeToCanvas?: boolean;
}

/**
 * Installs a document-level bubble-phase `keydown` listener that wires
 * `p` (focus panel), `Shift+P` (toggle panel), and optionally Escape
 * (return to canvas). The same handler serves both BPMN and DMN; host-
 * specific gating is injected via {@link PanelShortcutDeps}.
 */
export function installPanelShortcuts(deps: PanelShortcutDeps, opts?: PanelFocusOptions): void {
    document.addEventListener("keydown", (e: KeyboardEvent) => {
        if (deps.isEnabled && !deps.isEnabled()) return;

        if (e.key === "Escape" && deps.escapeToCanvas) {
            if (e.defaultPrevented) return;
            deps.focusCanvas();
            return;
        }

        if (e.defaultPrevented) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;

        if (e.shiftKey && e.key === "P") {
            if (isTextEditingSurface(document.activeElement)) return;
            togglePropertiesPanel(deps.handle, deps.focusCanvas, opts);
            e.preventDefault();
            return;
        }

        if (!e.shiftKey && e.key === "p") {
            if (!deps.isCanvasFocused()) return;
            focusPropertiesPanel(deps.handle, opts);
            e.preventDefault();
        }
    });
}
