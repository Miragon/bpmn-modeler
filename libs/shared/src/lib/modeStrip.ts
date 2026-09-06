import type { DetectedEngine } from "@miragon/bpmn-modeler-types";
import type { PropertiesPanelHandle } from "./propertiesPanelResizer";
import {
    IMPLEMENT_UNAVAILABLE_HINT,
    MODE_BADGE,
    MODE_LABEL,
    SURFACE_MODES,
    isModeAvailable,
    type SurfaceMode,
} from "./surfaceMode";

/**
 * Translator seam, matching the shape of the shared i18n `translate`. Kept
 * injected (not imported) so this module stays in `libs/shared` i18n-agnostic —
 * each host webview backs it with its own overlay, same as
 * {@link PropertiesPanelResizerOptions}.
 */
export type ModeStripTranslate = (template: string, replacements?: Record<string, string>) => string;

export interface ModeStripOptions {
    /** The panel host (`#js-properties-panel`); carries `data-surface-mode` / `aria-busy`. */
    host: HTMLElement;
    /** The segmented-control row inside the host. */
    stripEl: HTMLElement;
    /**
     * The panel resizer (`#js-panel-resizer`); hosts the collapsed-rail badge.
     * Optional — when absent the badge is skipped (mirrors the resizer's
     * `NOOP_HANDLE`), and the strip still renders its buttons.
     */
    resizerEl?: HTMLElement;
    /** Reveals the panel when the collapsed-rail badge is clicked. */
    panelHandle: PropertiesPanelHandle;
    /** Translates the button/hint/badge labels; wire to i18n. */
    translate: ModeStripTranslate;
    /** Re-apply the labels on change (e.g. language switch); wire to i18n. */
    onLabelChange?: (apply: () => void) => void;
    onSelect: (mode: SurfaceMode) => void;
    onEscape: () => void;
}

interface ModeStripState {
    mode: SurfaceMode;
    engine: DetectedEngine;
    busy: boolean;
}

export interface ModeStrip {
    render(state: ModeStripState): void;
}

/**
 * Builds the mode segmented control (in the panel header) and the collapsed-rail
 * badge (on the resizer). {@link ModeStrip.render} is idempotent: it re-derives
 * every button's pressed/disabled state and the badge letter from the given
 * state, so the caller can call it freely as the session changes. Labels are
 * translated on every render, and re-applied via {@link ModeStripOptions.onLabelChange}
 * on a language switch.
 */
export function mountModeStrip(opts: ModeStripOptions): ModeStrip {
    const buttons = new Map<SurfaceMode, HTMLButtonElement>();

    const group = document.createElement("div");
    group.className = "mode-group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", opts.translate("Mode"));

    for (const mode of SURFACE_MODES) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mode-button";
        button.addEventListener("click", () => {
            // A real `disabled` attribute suppresses the tooltip in some
            // browsers, so unavailability is expressed via aria + an ignored click.
            if (button.getAttribute("aria-disabled") === "true") {
                return;
            }
            opts.onSelect(mode);
        });
        buttons.set(mode, button);
        group.appendChild(button);
    }

    opts.stripEl.appendChild(group);

    opts.stripEl.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            opts.onEscape();
        }
    });

    // The collapsed-rail badge: shown (via CSS) only while the panel is
    // collapsed, so the current mode stays visible and the panel is one click
    // away. Skipped when no resizer element is supplied.
    let badge: HTMLButtonElement | undefined;
    if (opts.resizerEl) {
        badge = document.createElement("button");
        badge.type = "button";
        badge.className = "mode-badge";
        badge.addEventListener("mousedown", (event) => event.stopPropagation());
        badge.addEventListener("click", (event) => {
            event.stopPropagation();
            opts.panelHandle.setVisible(true);
        });
        opts.resizerEl.appendChild(badge);
    }

    let lastState: ModeStripState | undefined;

    const applyLabels = (state: ModeStripState): void => {
        group.setAttribute("aria-label", opts.translate("Mode"));

        for (const [buttonMode, button] of buttons) {
            const available = isModeAvailable(buttonMode, state.engine);
            button.textContent = opts.translate(MODE_LABEL[buttonMode]);
            button.setAttribute("aria-pressed", buttonMode === state.mode ? "true" : "false");
            if (available) {
                button.removeAttribute("aria-disabled");
                button.removeAttribute("title");
            } else {
                button.setAttribute("aria-disabled", "true");
                button.title = opts.translate(IMPLEMENT_UNAVAILABLE_HINT);
            }
        }

        if (badge) {
            badge.textContent = MODE_BADGE[state.mode];
            const label = opts.translate("{mode} — open properties panel", {
                mode: opts.translate(MODE_LABEL[state.mode]),
            });
            badge.setAttribute("aria-label", label);
            badge.title = label;
        }
    };

    opts.onLabelChange?.(() => {
        if (lastState) {
            applyLabels(lastState);
        }
    });

    return {
        render(state: ModeStripState): void {
            lastState = state;
            opts.host.setAttribute("data-surface-mode", state.mode);
            opts.host.setAttribute("aria-busy", state.busy ? "true" : "false");
            applyLabels(state);
        },
    };
}
