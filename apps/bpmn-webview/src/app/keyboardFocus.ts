/**
 * Injected dependencies for the webview-level "Escape → focus canvas" guard.
 *
 * Closures rather than a service handle so this stays testable without a live
 * bpmn-js modeler and so the real services can be resolved lazily (they don't
 * exist until the modeler is created).
 */
export interface KeyboardFocusDeps {
    /**
     * The DOM subtrees this instance owns — the canvas container and its
     * properties-panel parent. An Escape is only handled when it originates
     * inside one of these, so multiple modelers on one page never cross-fire:
     * an Escape in panel A re-homes canvas A, not canvas B. Escape must be
     * caught in the properties panel (a *sibling* of the canvas, not a
     * descendant), which is why this is a document listener scoped by roots
     * rather than a container listener.
     */
    roots: HTMLElement[];
    /** Moves DOM focus onto the canvas SVG (`canvas.focus()`). */
    focusCanvas: () => void;
    /** Whether the canvas SVG currently holds DOM focus (`canvas.isFocused()`). */
    isCanvasFocused: () => boolean;
    /** Whether any element is currently selected (`selection.get().length > 0`). */
    hasSelection: () => boolean;
    /** Clears the current selection (`selection.select(null)`). */
    clearSelection: () => void;
    /** Whether the diagram-js SearchPad is currently open. */
    isSearchPadOpen: () => boolean;
    /** Closes the SearchPad (restores the cached selection). */
    closeSearchPad: () => void;
    /**
     * When `true`, an Escape fired with focus on `<body>` (nothing focused) is
     * also handled — the single-instance host wants a stray Escape anywhere on
     * the page to re-home the canvas. Defaults to `false` so a library consumer
     * hosting several modelers only reacts to Escapes inside its own roots.
     */
    handleGlobalEscape?: boolean;
}

/**
 * Installs a document-level Escape handler that pulls focus back onto the
 * canvas — the Vim-style "return to normal mode".
 *
 * bpmn-js's Keyboard service only listens on the canvas SVG (diagram-js ≥ 15,
 * `tabindex=0`), so while focus sits in the properties panel, a FEEL editor,
 * or a search field, keystrokes like `A`/`N`/arrows never reach the modeler.
 * Escape re-homes focus so the next keystroke drives the diagram again.
 *
 * Escape is staged, one layer per press (mirroring the append-menu's
 * template-then-close staging): while focus is elsewhere it only re-homes
 * focus and *keeps* the selection — selection anchors the keyboard-modelling
 * flow (`A`/`R`/arrows) and drives the properties panel, so clearing it here
 * would blank the panel the user just escaped from. Only a further Escape on
 * the already-focused canvas clears the selection, reaching the neutral state
 * the focus reticle marks. bpmn-js has no deselect-on-Escape of its own.
 *
 * The listener runs in the **bubble** phase and stays deliberately passive
 * (no preventDefault/stopPropagation) so host Escape behaviour is untouched.
 *
 * @param deps Injected roots + focus/selection/search-pad closures (see {@link KeyboardFocusDeps}).
 * @returns A disposer that removes the document listener, so a destroyed
 *   modeler instance stops reacting to Escapes.
 */
export function installKeyboardFocus(deps: KeyboardFocusDeps): () => void {
    const handler = (e: KeyboardEvent): void => {
        if (e.key !== "Escape") return;

        // Scope to this instance's own subtrees: an Escape targeting another
        // modeler (or unrelated page chrome) must not re-home our canvas. The
        // single-instance host opts into also handling body-targeted Escapes so
        // a keystroke with nothing focused still returns to the canvas.
        const target = e.target;
        const inRoots = target instanceof Node && deps.roots.some((root) => root.contains(target));
        const isGlobalBody = deps.handleGlobalEscape === true && target === document.body;
        if (!inRoots && !isGlobalBody) return;

        // Something already handled this Escape. Covers CodeMirror 6 (FEEL
        // editor), whose Escape binding preventDefault-s only while its
        // autocomplete popup is open — so the first Escape closes the popup
        // and the second reaches us — plus any Escape bpmn-js itself consumes.
        if (e.defaultPrevented) return;

        // The append-menu and template-chooser overlays need no guard here:
        // both register Escape as a document *capture* listener with
        // stopPropagation, so this bubble listener never fires while they are
        // open. First Escape closes the overlay; a second one lands here and
        // focuses the canvas.

        // SearchPad closes on keyup, not keydown (SearchPad.js). If we pulled
        // focus to the canvas on this keydown, the matching keyup would miss
        // the search field and the pad would stay open forever. So close it
        // explicitly here: one Escape both closes the search and focuses the
        // canvas.
        if (deps.isSearchPadOpen()) {
            deps.closeSearchPad();
            deps.focusCanvas();
            return;
        }

        // Label direct-editing needs no guard: its keydown handler stops
        // propagation for every key, so we never see its Escape. Drag cancel
        // and the popup menu preventDefault theirs, caught above — so reaching
        // this point means there is no more transient UI layer to peel.

        // Final layer: Escape on the already-focused canvas drops the
        // selection (Figma/vim-visual convention), reaching the bare
        // canvas-focus state the reticle lights up for.
        if (deps.isCanvasFocused() && deps.hasSelection()) {
            deps.clearSelection();
            return;
        }

        deps.focusCanvas();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
}
