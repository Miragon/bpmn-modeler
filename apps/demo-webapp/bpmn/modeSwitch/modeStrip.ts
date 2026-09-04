import type { DetectedEngine } from "@miragon/bpmn-modeler";
import type { PropertiesPanelHandle } from "@miragon/bpmn-modeler-shared";
import {
    DEMO_MODES,
    IMPLEMENT_UNAVAILABLE_HINT,
    MODE_BADGE,
    MODE_LABEL,
    isModeAvailable,
    type DemoMode,
} from "./modeModel";

export interface ModeStripOptions {
    /** The panel host (`#js-properties-panel`); carries `data-demo-mode` / `aria-busy`. */
    host: HTMLElement;
    /** The segmented-control row inside the host. */
    stripEl: HTMLElement;
    /** The panel resizer (`#js-panel-resizer`); hosts the collapsed-rail badge. */
    resizerEl: HTMLElement;
    /** Reveals the panel when the collapsed-rail badge is clicked. */
    panelHandle: PropertiesPanelHandle;
    onSelect: (mode: DemoMode) => void;
    onEscape: () => void;
}

interface ModeStripState {
    mode: DemoMode;
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
 * state, so the caller can call it freely as the session changes.
 */
export function mountModeStrip(opts: ModeStripOptions): ModeStrip {
    const buttons = new Map<DemoMode, HTMLButtonElement>();

    const group = document.createElement("div");
    group.className = "demo-mode-group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Mode");

    for (const mode of DEMO_MODES) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "demo-mode-button";
        button.textContent = MODE_LABEL[mode];
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
    // collapsed, so the current mode stays visible and the panel is one click away.
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "demo-mode-badge";
    badge.addEventListener("mousedown", (event) => event.stopPropagation());
    badge.addEventListener("click", (event) => {
        event.stopPropagation();
        opts.panelHandle.setVisible(true);
    });
    opts.resizerEl.appendChild(badge);

    return {
        render({ mode, engine, busy }: ModeStripState): void {
            opts.host.setAttribute("data-demo-mode", mode);
            opts.host.setAttribute("aria-busy", busy ? "true" : "false");

            for (const [buttonMode, button] of buttons) {
                const available = isModeAvailable(buttonMode, engine);
                button.setAttribute("aria-pressed", buttonMode === mode ? "true" : "false");
                if (available) {
                    button.removeAttribute("aria-disabled");
                    button.removeAttribute("title");
                } else {
                    button.setAttribute("aria-disabled", "true");
                    button.title = IMPLEMENT_UNAVAILABLE_HINT;
                }
            }

            badge.textContent = MODE_BADGE[mode];
            badge.setAttribute("aria-label", `${MODE_LABEL[mode]} — open properties panel`);
            badge.title = badge.getAttribute("aria-label") ?? "";
        },
    };
}
