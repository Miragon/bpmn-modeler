import {
    SURFACE_MODES,
    isModeAvailable,
    type DetectedEngine,
    type SurfaceMode,
} from "@miragon/bpmn-modeler-types";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";

/** Human-readable label for the mode chip and the menu entries. */
export const MODE_LABEL: Record<SurfaceMode, string> = {
    view: "View",
    design: "Design",
    implement: "Implement",
};

/** One-line explanation shown below each menu entry. */
export const MODE_DESCRIPTION: Record<SurfaceMode, string> = {
    view: "Read-only",
    design: "Engine-neutral modeling",
    implement: "Camunda properties, templates and lint",
};

/** @deprecated The strip no longer renders a collapsed-rail badge. */
export const MODE_BADGE: Record<SurfaceMode, string> = {
    view: "V",
    design: "D",
    implement: "I",
};

/** Tooltip on the Implement entry when the model carries no execution platform. */
export const IMPLEMENT_UNAVAILABLE_HINT =
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.";

/** Translator seam, matching the shape of the modeler's i18n `translate`. */
export type ModeStripTranslate = (
    template: string,
    replacements?: Record<string, string>,
) => string;

export interface ModeStripOptions {
    /**
     * The canvas-side anchor the strip mounts its mode chip and menu into; place
     * it as a direct child of the diagram container.
     */
    stripEl: HTMLElement;
    /** Optional host element that carries `data-surface-mode` / `aria-busy`. */
    host?: HTMLElement;
    /** @deprecated Ignored: the strip no longer renders a collapsed-rail badge. */
    resizerEl?: HTMLElement;
    /** @deprecated Ignored: the strip no longer renders a collapsed-rail badge. */
    revealPanel?: () => void;
    /** Which modes to offer, in order; defaults to all three. */
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

const CARET_SVG =
    '<svg class="mode-chip-caret" viewBox="0 0 8 8" aria-hidden="true">' +
    '<path d="M1 2.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

const MENU_GAP = 4;
const TOGGLE_GAP = 8;
const VIEWPORT_MARGIN = 8;

/**
 * Builds the mode chip (on the canvas, next to the token-simulation toggle) and
 * the mode menu it opens. {@link ModeStrip.render} is idempotent: it re-derives
 * the chip label and each entry's checked/disabled state from the given state.
 *
 * When fewer than two modes are offered the strip mounts **no** chip or menu —
 * it still stamps `data-surface-mode` / `aria-busy` on `host` — so a
 * single-mode session shows no control.
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

    const stampHost = (state: ModeStripState): void => {
        opts.host?.setAttribute("data-surface-mode", state.mode);
        opts.host?.setAttribute("aria-busy", state.busy ? "true" : "false");
    };

    // Fewer than two modes ⇒ no control at all (the single-mode guarantee).
    if (modes.length < 2) {
        return { render: stampHost, destroy: () => undefined };
    }

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "mode-chip";
    chip.setAttribute("aria-haspopup", "menu");
    chip.setAttribute("aria-expanded", "false");
    const chipLabel = document.createElement("span");
    chipLabel.className = "mode-chip-label";
    chip.appendChild(chipLabel);
    chip.insertAdjacentHTML("beforeend", CARET_SVG);
    opts.stripEl.appendChild(chip);

    const menu = document.createElement("div");
    menu.className = "mode-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    opts.stripEl.appendChild(menu);

    const items = new Map<SurfaceMode, HTMLButtonElement>();
    for (const mode of modes) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "mode-menu-item";
        item.dataset.mode = mode;
        item.setAttribute("role", "menuitemradio");
        item.innerHTML =
            '<span class="mode-menu-item-label"></span>' +
            '<span class="mode-menu-item-description"></span>';
        item.addEventListener("click", () => {
            // A real `disabled` attribute suppresses the tooltip in some
            // browsers, so unavailability is expressed via aria + an ignored click.
            if (item.getAttribute("aria-disabled") === "true") {
                return;
            }
            closeMenu();
            opts.onSelect(mode);
        });
        items.set(mode, item);
        menu.appendChild(item);
    }

    let lastState: ModeStripState | undefined;
    let open = false;

    chip.addEventListener("click", (event) => {
        event.stopPropagation();
        if (open) {
            closeMenu();
        } else {
            openMenu();
        }
    });
    chip.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            openMenu();
        } else if (event.key === "Escape" && !open) {
            opts.onEscape?.();
        }
    });

    function openMenu(): void {
        open = true;
        chip.setAttribute("aria-expanded", "true");
        menu.hidden = false;
        placeMenu();
        (lastState && items.get(lastState.mode))?.focus();
        document.addEventListener("mousedown", onOutsidePress, true);
        window.addEventListener("resize", onViewportResize);
    }

    function closeMenu({ restoreFocus = true } = {}): void {
        if (!open) {
            return;
        }
        open = false;
        chip.setAttribute("aria-expanded", "false");
        menu.hidden = true;
        document.removeEventListener("mousedown", onOutsidePress, true);
        window.removeEventListener("resize", onViewportResize);
        if (restoreFocus) {
            chip.focus();
        }
    }

    // Fixed positioning, clamped to the viewport, so a small canvas never clips the menu.
    function placeMenu(): void {
        const anchor = chip.getBoundingClientRect();
        const { width, height } = menu.getBoundingClientRect();
        menu.style.left = `${clamp(anchor.left, window.innerWidth - width)}px`;
        menu.style.top = `${clamp(anchor.bottom + MENU_GAP, window.innerHeight - height)}px`;
    }

    function clamp(position: number, max: number): number {
        return Math.max(VIEWPORT_MARGIN, Math.min(position, max - VIEWPORT_MARGIN));
    }

    function onOutsidePress(event: MouseEvent): void {
        const target = event.target as Node;
        if (!menu.contains(target) && !chip.contains(target)) {
            closeMenu({ restoreFocus: false });
        }
    }

    function onViewportResize(): void {
        closeMenu({ restoreFocus: false });
    }

    menu.addEventListener("keydown", (event) => {
        const entries = [...items.values()];
        const current = entries.indexOf(document.activeElement as HTMLButtonElement);
        const targetByKey: Record<string, number> = {
            ArrowDown: (current + 1) % entries.length,
            ArrowUp: (current - 1 + entries.length) % entries.length,
            Home: 0,
            End: entries.length - 1,
        };
        if (event.key in targetByKey) {
            event.preventDefault();
            entries[targetByKey[event.key]].focus();
        } else if (event.key === "Escape") {
            event.stopPropagation();
            closeMenu();
        } else if (event.key === "Tab") {
            closeMenu({ restoreFocus: false });
        }
    });

    const applyLabels = (state: ModeStripState): void => {
        const currentLabel = t(MODE_LABEL[state.mode]);
        const triggerLabel = t("Mode: {mode}", { mode: currentLabel });
        menu.setAttribute("aria-label", t("Mode"));

        chipLabel.textContent = currentLabel;
        chip.setAttribute("aria-label", triggerLabel);
        chip.title = triggerLabel;

        for (const [itemMode, item] of items) {
            item.querySelector(".mode-menu-item-label")!.textContent = t(MODE_LABEL[itemMode]);
            item.querySelector(".mode-menu-item-description")!.textContent = t(
                MODE_DESCRIPTION[itemMode],
            );
            item.setAttribute("aria-checked", itemMode === state.mode ? "true" : "false");
            if (isModeAvailable(itemMode, state.engine)) {
                item.removeAttribute("aria-disabled");
                item.removeAttribute("title");
            } else {
                item.setAttribute("aria-disabled", "true");
                item.title = t(IMPLEMENT_UNAVAILABLE_HINT);
            }
        }
    };

    // The toggle belongs to the live surface, so it is recreated on a mode
    // switch and absent before the first surface exists.
    const alignBesideTokenSimulationToggle = (): void => {
        const toggle = opts.stripEl.parentElement?.querySelector<HTMLElement>(".bts-toggle-mode");
        opts.stripEl.style.left = toggle
            ? `${toggle.offsetLeft + toggle.offsetWidth + TOGGLE_GAP}px`
            : "";
    };

    registerLabelChange(() => {
        if (lastState) {
            applyLabels(lastState);
        }
    });

    return {
        render(state: ModeStripState): void {
            lastState = state;
            stampHost(state);
            alignBesideTokenSimulationToggle();
            applyLabels(state);
        },
        destroy(): void {
            labelDisposer?.();
            closeMenu({ restoreFocus: false });
            chip.remove();
            menu.remove();
            items.clear();
        },
    };
}
