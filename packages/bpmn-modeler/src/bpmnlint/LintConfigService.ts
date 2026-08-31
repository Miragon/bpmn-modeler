import type {
    BpmnlintConfig,
    Engine,
    LintResults,
    LintRunEvent,
} from "@miragon/bpmn-modeler-types";

import { BrowserLinter } from "./browserLinter";

/**
 * The subset of `bpmn-js-bpmnlint`'s `linting` module this service drives. The
 * package ships no types, so we declare only the members we touch: `lint` is
 * overridden per tier, and `update`/`isActive`/`toggle` repaint or clear the
 * overlays.
 */
interface Linting {
    lint: () => Promise<LintResults>;
    update(): void;
    isActive(): boolean;
    toggle(active: boolean): void;
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

/** The bpmn-js viewer, injected as `bpmnjs`; only its definitions root is read. */
interface Bpmnjs {
    getDefinitions(): unknown;
}

/** diagram-js's event bus, injected as `eventBus`; only import completion is observed. */
interface EventBus {
    on(event: string, callback: (event: unknown) => void): void;
}

type Translate = (template: string) => string;

/**
 * The per-instance tier decision, registered as the `lintTier` DI value by
 * {@link createLintModule}. `"external"` keeps today's host-pushed flow;
 * `"in-page"` runs {@link BrowserLinter} in the webview against the given
 * `engine` (and optional explicit `config`). `false`/off never reaches here — a
 * disabled instance registers no lint module at all.
 */
export interface LintTierInit {
    tier: "external" | "in-page";
    engine: Engine;
    config?: BpmnlintConfig;
}

/**
 * The facade callbacks, registered as the `lintCallbacks` DI value.
 * `onLintResults` fires after every *in-page* run (never for an external push,
 * so a host feeding results does not echo them); `onLintingToggled` fires when
 * the user flips the in-canvas chrome, in every active tier.
 */
export interface LintCallbacks {
    onLintResults?: (event: LintRunEvent) => void;
    onLintingToggled?: (enabled: boolean) => void;
}

/**
 * The live tier of one modeler instance.
 *
 *  - `external` — results arrive via {@link LintConfigService.applyLintResults};
 *    the webview only paints them (the host runs the linter).
 *  - `in-page` — the webview lints itself via {@link BrowserLinter} on every
 *    relint the vendor schedules.
 *  - `in-page-disabled` — the user turned in-page linting off from the canvas;
 *    overlays are cleared and a re-enable chip is shown, but the tier is
 *    remembered so a re-import does not silently reactivate it.
 *
 * Precedence: any external push wins — it switches an in-page instance to
 * `external` and suspends the in-page run.
 */
type LintTierState = "external" | "in-page" | "in-page-disabled";

// A slashed circle, painted in `currentColor` so it inherits the chip's text
// colour like the vendor lint icon does.
const OFF_ICON = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><line x1="4" y1="4" x2="12" y2="12"/></svg>`;

/**
 * Vendor `_formatIssues` mutates each report object in place (it writes
 * `report.rule`, `report.isChildIssue`, …). So the object we hand the vendor must
 * not be the one we emitted through `onLintResults`: copy every report first so
 * the emitted {@link LintRunEvent} stays the pristine rule-keyed output.
 */
function shallowCopyResults(results: LintResults): LintResults {
    const copy: LintResults = {};
    for (const [rule, reports] of Object.entries(results)) {
        copy[rule] = reports.map((report) => ({ ...report }));
    }
    return copy;
}

/**
 * bpmn-js DI service (registered by {@link createLintModule}) that owns one
 * modeler's bpmnlint tier and its in-canvas chrome.
 *
 * It drives `bpmn-js-bpmnlint`'s `linting` module by overriding its `lint()` —
 * the module's own `update()` (fired on import, element changes, toggles) then
 * diffs and draws the overlays exactly as before, so no overlay/rendering code
 * changes across tiers. The override's body depends on the tier: `external`
 * returns the host's last-pushed results; `in-page` runs {@link BrowserLinter}
 * against the live tree and emits the raw result through `onLintResults`;
 * `in-page-disabled` returns nothing so the linter, which the vendor keeps
 * running even while inactive, does no real work.
 *
 * It also owns the in-canvas **disable affordance**: an "off" button beside the
 * lint summary pill, and a muted "Linting off" chip with an "Enable" action in
 * its place once disabled — the entry points a non-technical user needs, since
 * they may never open host settings. In the in-page tier the toggle is applied
 * optimistically (the webview owns the linter); in the external tier it is
 * reported through `onLintingToggled` and the overlays wait for the host's push,
 * exactly as before.
 */
export class LintConfigService {
    static $inject = [
        "linting",
        "lintTier",
        "lintCallbacks",
        "translate",
        "canvas",
        "bpmnjs",
        "eventBus",
    ];

    private state: LintTierState;

    // Present once the in-page tier is live; undefined for a purely external
    // instance. Mutable because the host can hand linting back to the webview
    // after construction (#1373 Phase B) via {@link startInPageLinting}, which
    // lazily builds it — the constructor only builds it for an up-front in-page tier.
    private browserLinter?: BrowserLinter;

    // Kept from `tierInit` so a later {@link startInPageLinting} can construct a
    // BrowserLinter with the same engine (and the original explicit config when
    // the handback carries none).
    private readonly engine: Engine;

    private readonly explicitConfig?: BpmnlintConfig;

    // The config-version token of the last in-page instruction (#1384). Used to
    // dedup a repeat covered instruction, but only while actually `"in-page"`:
    // any disabled/external push in between leaves this stale, and the state
    // guard below stops that stale token from dropping a genuine re-enable.
    private lastConfigToken?: string;

    private results: LintResults = {};

    private toolbar?: HTMLElement;

    private offButton?: HTMLButtonElement;

    private disabledChip?: HTMLElement;

    constructor(
        private readonly linting: Linting,
        tierInit: LintTierInit,
        private readonly callbacks: LintCallbacks,
        private readonly translate: Translate,
        private readonly canvas: Canvas,
        private readonly bpmnjs: Bpmnjs,
        eventBus: EventBus,
    ) {
        this.state = tierInit.tier === "in-page" ? "in-page" : "external";
        this.engine = tierInit.engine;
        this.explicitConfig = tierInit.config;
        if (tierInit.tier === "in-page") {
            this.browserLinter = new BrowserLinter(this.engine, this.explicitConfig);
        }

        // One `lint` override for every tier; {@link runLint} branches on state.
        // The vendor calls it from `update()` on import.done / elements.changed.
        this.linting.lint = () => this.runLint();

        // Registered unconditionally so a post-handback re-import re-activates the
        // in-page tier too (an external instance can later become in-page via
        // {@link startInPageLinting}). Guarded on the current state so it never
        // activates an external instance and never resurrects a user-disabled one.
        eventBus.on("import.done", () => {
            if (this.state === "in-page") {
                this.activateInPage();
            }
        });
        if (tierInit.tier === "in-page" && this.bpmnjs.getDefinitions()) {
            this.activateInPage();
        }
    }

    /**
     * Starts (or restarts) the in-page linter on host instruction — the #1373
     * Phase B handback when the host finds no workspace `.bpmnlintrc`. Lazily
     * builds the {@link BrowserLinter} (the constructor only builds it for an
     * up-front in-page tier) and activates it if a diagram is already imported;
     * otherwise the unconditional `import.done` listener activates it.
     *
     * No-ops when the user has disabled linting from the canvas — a host
     * instruction must never silently re-enable a user-disabled linter; the
     * chip's own click handler owns re-enable. Also no-ops when already in-page
     * with a duplicate instruction (no new config, or the same `configToken` as
     * the live run — the host re-sends on panel re-activation and rebuilding the
     * {@link BrowserLinter} would churn the lint chrome for nothing). The dedup
     * is gated on `state === "in-page"` so a token left stale by an intervening
     * disabled/external push can never drop a genuine re-enable. Precedence is
     * unchanged: {@link applyLintResults}/{@link applyLintingDisabled} still
     * hard-set `"external"`, so any host push still wins over this.
     */
    startInPageLinting(config?: BpmnlintConfig, configToken?: string): void {
        if (this.state === "in-page-disabled") {
            return;
        }
        if (this.state === "in-page" && this.browserLinter) {
            if (config === undefined) {
                return;
            }
            if (configToken !== undefined && configToken === this.lastConfigToken) {
                return;
            }
        }
        this.lastConfigToken = configToken;
        this.browserLinter = new BrowserLinter(this.engine, config ?? this.explicitConfig);
        this.state = "in-page";
        if (this.bpmnjs.getDefinitions()) {
            this.activateInPage();
        }
    }

    /**
     * Applies host-pushed results (external tier). Any push wins: an in-page
     * instance switches to `external` and its in-page run is suspended. `null`
     * deactivates linting — the no-config experience, unchanged from before.
     */
    applyLintResults(results: LintResults | null): void {
        this.state = "external";
        this.render(results);
    }

    /**
     * Applies the host's **user-disabled** push (external tier): clears the
     * overlays and shows the re-enable chip. Switches an in-page instance to
     * `external` as any push does.
     */
    applyLintingDisabled(): void {
        this.state = "external";
        this.renderDisabled();
    }

    /**
     * The tier-dependent body behind the vendor's `lint()`. Only the in-page tier
     * emits `onLintResults`, and only it returns freshly copied reports (the
     * vendor mutates them); the external tier replays the host's last results and
     * the disabled tier returns nothing so no overlays are drawn.
     */
    private async runLint(): Promise<LintResults> {
        if (this.state === "in-page" && this.browserLinter) {
            const event = await this.browserLinter.run(this.bpmnjs.getDefinitions());
            this.callbacks.onLintResults?.(event);
            return shallowCopyResults(event.results);
        }
        if (this.state === "in-page-disabled") {
            return {};
        }
        return this.results;
    }

    /**
     * Switches the in-page linter on: marks the container, activates the vendor
     * module (which triggers the first relint through our override), and shows the
     * off button. Idempotent — a relint reuses the existing chrome.
     */
    private activateInPage(): void {
        this.hideDisabledChip();
        this.canvas.getContainer().classList.add("bpmnlint-active");
        if (this.linting.isActive()) {
            this.linting.update();
        } else {
            this.linting.toggle(true);
        }
        this.showOffButton();
    }

    /**
     * Renders `results`, or deactivates linting when `results` is `null` (no
     * `.bpmnlintrc`, or a host read/lint failure) — keeping the no-config
     * experience identical to before linting moved to the host.
     */
    private render(results: LintResults | null): void {
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
    private renderDisabled(): void {
        this.results = {};
        if (this.linting.isActive()) {
            this.linting.toggle(false);
        }
        this.canvas.getContainer().classList.remove("bpmnlint-active");
        this.hideOffButton();
        this.showDisabledChip();
    }

    /**
     * Handles the off button. Reports the toggle to the host in every tier; in the
     * in-page tier it also flips the state and clears the overlays optimistically
     * (the webview owns the linter). In the external tier the render waits for the
     * host's disabled push — today's behaviour.
     */
    private handleOffClick(): void {
        this.callbacks.onLintingToggled?.(false);
        if (this.state === "in-page") {
            this.state = "in-page-disabled";
            this.renderDisabled();
        }
    }

    /**
     * Handles the re-enable chip. Reports the toggle in every tier; in the in-page
     * tier it also flips back and re-runs the in-page lint. In the external tier
     * the overlays wait for the host's push.
     */
    private handleEnableClick(): void {
        this.callbacks.onLintingToggled?.(true);
        if (this.state === "in-page-disabled") {
            this.state = "in-page";
            this.activateInPage();
        }
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
                this.handleOffClick();
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
                this.handleEnableClick();
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
