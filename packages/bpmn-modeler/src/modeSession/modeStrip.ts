import {
    SURFACE_MODES,
    isModeAvailable,
    type DetectedEngine,
    type SurfaceMode,
} from "@miragon/bpmn-modeler-types";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";

/** Human-readable label for the segmented control. */
export const MODE_LABEL: Record<SurfaceMode, string> = {
    view: "View",
    design: "Design",
    implement: "Implement",
};

/** Single-letter badge shown on the collapsed-panel rail. */
export const MODE_BADGE: Record<SurfaceMode, string> = {
    view: "V",
    design: "D",
    implement: "I",
};

/** Tooltip on the Implement button when the model carries no execution platform. */
export const IMPLEMENT_UNAVAILABLE_HINT =
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.";

/** Translator seam, matching the shape of the modeler's i18n `translate`. */
export type ModeStripTranslate = (
    template: string,
    replacements?: Record<string, string>,
) => string;

export interface ModeStripOptions {
    /** The segmented-control row the strip mounts its group into. */
    stripEl: HTMLElement;
    /** Optional host element that carries `data-surface-mode` / `aria-busy`. */
    host?: HTMLElement;
    /**
     * The panel resizer element; hosts the collapsed-rail badge. Optional — when
     * absent the badge is skipped and the strip still renders its buttons.
     */
    resizerEl?: HTMLElement;
    /** Reveals the properties panel when the collapsed-rail badge is clicked. */
    revealPanel?: () => void;
    /** Which mode buttons to render, in order; defaults to all three. */
    modes?: readonly SurfaceMode[];
    /** Translates the labels; defaults to the modeler's i18n (extended with the overlay). */
    translate?: ModeStripTranslate;
    /** Re-apply the labels on change (e.g. language switch); defaults to `i18n.onChange`. */
    onLabelChange?: (apply: () => void) => void;
    onSelect: (mode: SurfaceMode) => void;
    onEscape?: () => void;
}

export interface ModeStripState {
    mode: SurfaceMode;
    engine: DetectedEngine;
    busy: boolean;
}

export interface ModeStrip {
    render(state: ModeStripState): void;
    destroy(): void;
}

/**
 * Builds the mode segmented control (in the panel header) and the collapsed-rail
 * badge (on the resizer). {@link ModeStrip.render} is idempotent: it re-derives
 * each button's pressed/disabled state and the badge letter from the given state.
 *
 * When fewer than two modes are rendered the strip mounts **no** group and **no**
 * badge — it still stamps `data-surface-mode` / `aria-busy` on `host` — so a
 * single-mode session shows no buttons.
 */
export function mountModeStrip(opts: ModeStripOptions): ModeStrip {
    const modes = opts.modes ?? SURFACE_MODES;

    let translate = opts.translate;
    let labelDisposer: (() => void) | undefined;
    if (!translate) {
        // Default translator: the modeler's i18n, with the local overlay merged
        // in so the strip labels/hint resolve before any surface exists.
        i18n.extend(i18nExtras);
        translate = (template, replacements) => i18n.translate(template, replacements);
    }
    const t = translate;
    const registerLabelChange =
        opts.onLabelChange ?? ((apply) => (labelDisposer = i18n.onChange(apply)));

    const buttons = new Map<SurfaceMode, HTMLButtonElement>();
    // Fewer than two modes ⇒ no group, no badge (the single-mode guarantee).
    const showControls = modes.length >= 2;

    let group: HTMLDivElement | undefined;
    let badge: HTMLButtonElement | undefined;
    let onKeyDown: ((event: KeyboardEvent) => void) | undefined;

    if (showControls) {
        group = document.createElement("div");
        group.className = "mode-group";
        group.setAttribute("role", "group");
        group.setAttribute("aria-label", t("Mode"));

        for (const mode of modes) {
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

        onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                opts.onEscape?.();
            }
        };
        opts.stripEl.addEventListener("keydown", onKeyDown);

        // The collapsed-rail badge: shown (via CSS) only while the panel is
        // collapsed, so the current mode stays visible and the panel is one click
        // away. Skipped when no resizer element is supplied.
        if (opts.resizerEl) {
            badge = document.createElement("button");
            badge.type = "button";
            badge.className = "mode-badge";
            badge.addEventListener("mousedown", (event) => event.stopPropagation());
            badge.addEventListener("click", (event) => {
                event.stopPropagation();
                opts.revealPanel?.();
            });
            opts.resizerEl.appendChild(badge);
        }
    }

    let lastState: ModeStripState | undefined;

    const applyLabels = (state: ModeStripState): void => {
        if (!group) {
            return;
        }
        group.setAttribute("aria-label", t("Mode"));

        for (const [buttonMode, button] of buttons) {
            const available = isModeAvailable(buttonMode, state.engine);
            button.textContent = t(MODE_LABEL[buttonMode]);
            button.setAttribute("aria-pressed", buttonMode === state.mode ? "true" : "false");
            if (available) {
                button.removeAttribute("aria-disabled");
                button.removeAttribute("title");
            } else {
                button.setAttribute("aria-disabled", "true");
                button.title = t(IMPLEMENT_UNAVAILABLE_HINT);
            }
        }

        if (badge) {
            badge.textContent = MODE_BADGE[state.mode];
            const label = t("{mode} — open properties panel", {
                mode: t(MODE_LABEL[state.mode]),
            });
            badge.setAttribute("aria-label", label);
            badge.title = label;
        }
    };

    if (showControls) {
        registerLabelChange(() => {
            if (lastState) {
                applyLabels(lastState);
            }
        });
    }

    return {
        render(state: ModeStripState): void {
            lastState = state;
            opts.host?.setAttribute("data-surface-mode", state.mode);
            opts.host?.setAttribute("aria-busy", state.busy ? "true" : "false");
            applyLabels(state);
        },
        destroy(): void {
            labelDisposer?.();
            if (onKeyDown) {
                opts.stripEl.removeEventListener("keydown", onKeyDown);
            }
            group?.remove();
            badge?.remove();
            buttons.clear();
        },
    };
}
