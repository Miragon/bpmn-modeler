import { LintResults } from "@miragon/bpmn-modeler-types";

/**
 * The subset of `bpmn-js-bpmnlint`'s `linting` module this service drives. The
 * package ships no types, so we declare only the members we touch: `lint` is
 * overridden to return host-computed results, and `update`/`isActive`/`toggle`
 * repaint or clear the overlays.
 */
interface Linting {
    lint: () => Promise<LintResults>;
    update(): void;
    isActive(): boolean;
    toggle(active: boolean): void;
}

/**
 * The single host capability this service needs, registered as the `lintingHost`
 * DI value in bootstrap. Narrow on purpose so the service never touches the
 * postMessage protocol — bootstrap translates the call into the host command.
 */
interface LintingHost {
    setLintingEnabled(enabled: boolean): void;
}

/**
 * The slice of diagram-js's `Canvas` this service needs. The state classes and
 * the vendor pill are scoped to this container (`.djs-container`) rather than
 * `document.body`, so two modelers on one page never toggle each other's lint
 * chrome.
 */
interface Canvas {
    getContainer(): HTMLElement;
}

type Translate = (template: string) => string;

// A slashed circle, painted in `currentColor` so it inherits the chip's text
// colour like the vendor lint icon does.
const OFF_ICON = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><line x1="4" y1="4" x2="12" y2="12"/></svg>`;

/**
 * bpmn-js DI service (registered by {@link LintModule}) that renders
 * host-computed bpmnlint results in the canvas. The extension host now runs the
 * linter (a full Node context, so it resolves custom `bpmnlint-plugin-*` rules
 * against the workspace); the webview only paints overlays.
 *
 * It feeds results into `bpmn-js-bpmnlint`'s `linting` module by overriding the
 * module's `lint()` to return whatever the host last sent, instead of running a
 * browser-side `Linter`. The module's own `update()` — fired on import, element
 * changes, and toggles — then diffs and draws the overlays exactly as before, so
 * no overlay/rendering code changes.
 *
 * It also owns the in-canvas **disable affordance**: an "off" button beside the
 * lint summary pill (so the hint advertises that it can be switched off), and a
 * muted "Linting off" chip shown in its place once disabled — the entry points a
 * non-technical user needs, since they may never open VS Code settings. Both
 * write the choice back through the host, which re-lints and pushes the new
 * state down ({@link render} / {@link renderDisabled}); the webview never flips
 * its own overlays optimistically.
 */
export class LintConfigService {
    static $inject = ["linting", "lintingHost", "translate", "canvas"];

    private results: LintResults = {};

    private toolbar?: HTMLElement;

    private offButton?: HTMLButtonElement;

    private disabledChip?: HTMLElement;

    constructor(
        private readonly linting: Linting,
        private readonly lintingHost: LintingHost,
        private readonly translate: Translate,
        private readonly canvas: Canvas,
    ) {
        // Replace the browser-side lint run with the host's precomputed results.
        // `update()` calls `this.lint()`; returning the stored results makes every
        // relint (import.done / elements.changed) repaint them until the host,
        // which re-lints on document change, sends a fresh set.
        this.linting.lint = () => Promise.resolve(this.results);
    }

    /**
     * Renders `results`, or deactivates linting when `results` is `null` (no
     * `.bpmnlintrc`, or a host read/lint failure) — keeping the no-config
     * experience identical to before linting moved to the host.
     */
    render(results: LintResults | null): void {
        this.hideDisabledChip();
        if (!results) {
            this.results = {};
            if (this.linting.isActive()) {
                // Fires `linting.toggle`, which clears the overlays via `update()`.
                this.linting.toggle(false);
            }
            this.canvas.getContainer().classList.remove("bpmnlint-active");
            this.hideOffButton();
            return;
        }

        this.results = results;
        this.canvas.getContainer().classList.add("bpmnlint-active");
        if (this.linting.isActive()) {
            this.linting.update();
        } else {
            // Activating fires `linting.toggle`, which triggers the first `update()`.
            this.linting.toggle(true);
        }
        this.showOffButton();
    }

    /**
     * Renders the **user-disabled** state (distinct from the inactive `null`
     * above): clears the overlays like an inactive linter, but shows a muted
     * chip so the user can turn linting back on from inside the canvas — the
     * summary pill they would otherwise click is gone.
     */
    renderDisabled(): void {
        this.results = {};
        if (this.linting.isActive()) {
            this.linting.toggle(false);
        }
        this.canvas.getContainer().classList.remove("bpmnlint-active");
        this.hideOffButton();
        this.showDisabledChip();
    }

    /**
     * The vendor summary pill (created on module init, so it is present from the
     * first render even while hidden). Scoped to this modeler's canvas container
     * so a sibling modeler's pill is never picked up.
     */
    private pill(): HTMLElement | null {
        return this.canvas.getContainer().querySelector<HTMLElement>(".bjsl-button");
    }

    /**
     * Wraps the vendor pill in a flex row so an "off" button can sit beside it.
     * Idempotent: the vendor only rewrites the pill's `innerHTML`/classes on
     * relint, never re-parents it, so the wrapper and our button survive.
     */
    private ensureToolbar(): HTMLElement | null {
        const pill = this.pill();
        if (!pill || !pill.parentElement) {
            return null;
        }
        if (!this.toolbar) {
            this.toolbar = document.createElement("div");
            this.toolbar.className = "lint-toolbar";
        }
        if (pill.parentElement !== this.toolbar) {
            pill.parentElement.appendChild(this.toolbar);
            this.toolbar.appendChild(pill);
        }
        return this.toolbar;
    }

    private showOffButton(): void {
        const toolbar = this.ensureToolbar();
        if (!toolbar) {
            return;
        }
        if (!this.offButton) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "lint-off-button";
            button.innerHTML = OFF_ICON;
            const label = this.translate("Turn off linting");
            button.title = label;
            button.setAttribute("aria-label", label);
            button.addEventListener("click", () => {
                this.lintingHost.setLintingEnabled(false);
            });
            this.offButton = button;
        }
        if (this.offButton.parentElement !== toolbar) {
            toolbar.appendChild(this.offButton);
        }
        this.offButton.hidden = false;
    }

    private hideOffButton(): void {
        if (this.offButton) {
            this.offButton.hidden = true;
        }
    }

    private showDisabledChip(): void {
        const pill = this.pill();
        const container =
            pill?.parentElement === this.toolbar
                ? this.toolbar?.parentElement
                : pill?.parentElement;
        if (!container) {
            return;
        }
        if (!this.disabledChip) {
            const chip = document.createElement("div");
            chip.className = "lint-disabled-chip";

            const text = document.createElement("span");
            text.className = "lint-disabled-text";
            text.textContent = this.translate("Linting off");

            const enable = document.createElement("button");
            enable.type = "button";
            enable.className = "lint-enable-button";
            enable.textContent = this.translate("Enable");
            enable.addEventListener("click", () => {
                this.lintingHost.setLintingEnabled(true);
            });

            chip.appendChild(text);
            chip.appendChild(enable);
            this.disabledChip = chip;
        }
        if (this.disabledChip.parentElement !== container) {
            container.appendChild(this.disabledChip);
        }
        this.disabledChip.hidden = false;
        this.canvas.getContainer().classList.add("bpmnlint-disabled");
    }

    private hideDisabledChip(): void {
        this.canvas.getContainer().classList.remove("bpmnlint-disabled");
        if (this.disabledChip) {
            this.disabledChip.hidden = true;
        }
    }
}
