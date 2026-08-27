/**
 * Injected dependencies for the canvas focus indicator.
 *
 * Closures rather than a live modeler handle so this stays testable under
 * jsdom (same rationale as {@link KeyboardFocusDeps}) and so the real bpmn-js
 * services are resolved lazily at the call site — they don't exist until the
 * modeler is created.
 */
export interface CanvasFocusIndicatorDeps {
    /** Host element — production passes `canvas.getContainer()` (`.djs-container`). */
    parent: HTMLElement;
    /** Initial focus state (`canvas.isFocused()`). */
    isFocused: () => boolean;
    /**
     * Subscribes to focus changes — production adapts the eventBus
     * `canvas.focus.changed` `{ focused }` event.
     */
    onFocusChanged: (listener: (focused: boolean) => void) => void;
    /** Initial selection state (`selection.get().length > 0`). */
    hasSelection: () => boolean;
    /**
     * Subscribes to selection changes — production adapts the eventBus
     * `selection.changed` `{ newSelection }` event.
     */
    onSelectionChanged: (listener: (hasSelection: boolean) => void) => void;
}

// Material Symbols "center_focus_weak" (idle) / "center_focus_strong" filled
// (focused), viewBox 0 -960 960 960, fill=currentColor so CSS `color` recolors
// them. Two static SVGs rather than innerHTML swapping: re-parsing would
// restart the CSS glow animation mid-toggle.
const FOCUS_WEAK_SVG = `<svg class="canvas-focus-indicator__off" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M367-367q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47Zm169.5-56.5Q560-447 560-480t-23.5-56.5Q513-560 480-560t-56.5 23.5Q400-513 400-480t23.5 56.5Q447-400 480-400t56.5-23.5ZM480-480ZM200-120q-33 0-56.5-23.5T120-200v-160h80v160h160v80H200Zm400 0v-80h160v-160h80v160q0 33-23.5 56.5T760-120H600ZM120-600v-160q0-33 23.5-56.5T200-840h160v80H200v160h-80Zm640 0v-160H600v-80h160q33 0 56.5 23.5T840-760v160h-80Z"/></svg>`;
const FOCUS_STRONG_SVG = `<svg class="canvas-focus-indicator__on" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-120q-33 0-56.5-23.5T120-200v-160h80v160h160v80H200Zm400 0v-80h160v-160h80v160q0 33-23.5 56.5T760-120H600ZM120-600v-160q0-33 23.5-56.5T200-840h160v80H200v160h-80Zm640 0v-160H600v-80h160q33 0 56.5 23.5T840-760v160h-80ZM338.5-338.5Q280-397 280-480t58.5-141.5Q397-680 480-680t141.5 58.5Q680-563 680-480t-58.5 141.5Q563-280 480-280t-141.5-58.5Z"/></svg>`;

/**
 * Installs a focus reticle in the canvas's top-right corner, beside the
 * "Open minimap" control, that lights up
 * brand-green with a solid center while the canvas holds keyboard focus *and*
 * no element is selected, and shows a faint hollow reticle otherwise. On
 * focus gain the glow briefly pulses (the "you're back" moment), then settles
 * to a steady glow — canvas-focused is the normal state users sit in for
 * minutes, so a perpetual pulse would be an attention magnet.
 *
 * Selection gates the green state because clicking an element also puts DOM
 * focus on the canvas SVG — without the gate the reticle would light on every
 * selection, where the selection outline already shows that keystrokes target
 * the diagram. Green is reserved for the bare "canvas focus" state Escape
 * creates, which has no other visual marker.
 *
 * A reticle (not a bulb or keyboard) because a bulb collides with the IDE-wide
 * "quick fix available" affordance (VS Code/IntelliJ lightbulb); the
 * weak/strong reticle pair literally depicts focus snapping onto the canvas.
 *
 * It is the visual counterpart to {@link installKeyboardFocus}. It subscribes
 * to diagram-js's own
 * deduplicated `canvas.focus.changed` signal (fired from the canvas SVG's
 * `focusin`/`focusout` listeners) rather than observing a container-level
 * `focusin` — the latter would false-positive when another floating widget
 * inside the same `.djs-container` (e.g. the bpmnlint chip) takes focus.
 *
 * Purely decorative: `aria-hidden` + `pointer-events: none`. The focus move
 * itself already conveys the state to assistive tech, and a clickable glyph
 * would need a tab stop and would steal canvas clicks.
 *
 * @param deps Injected parent/focus closures (see {@link CanvasFocusIndicatorDeps}).
 * @returns A disposer that removes the reticle from the DOM, so a destroyed
 *   modeler instance leaves no orphaned overlay in its (shared-page) container.
 *   The event subscriptions die with the modeler's own event bus on destroy.
 */
export function installCanvasFocusIndicator(deps: CanvasFocusIndicatorDeps): () => void {
    const root = document.createElement("div");
    root.className = "canvas-focus-indicator";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = FOCUS_WEAK_SVG + FOCUS_STRONG_SVG;

    let focused = deps.isFocused();
    let hasSelection = deps.hasSelection();

    const render = (): void => {
        root.classList.toggle("is-focused", focused && !hasSelection);
    };

    // Render the initial state before subscribing so the glyph is correct even
    // if the canvas already has focus at install time.
    render();
    deps.onFocusChanged((nowFocused) => {
        focused = nowFocused;
        render();
    });
    deps.onSelectionChanged((nowHasSelection) => {
        hasSelection = nowHasSelection;
        render();
    });

    deps.parent.append(root);

    return () => root.remove();
}
