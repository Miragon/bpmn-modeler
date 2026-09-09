import type {
    BpmnlintConfig,
    Engine,
    LintResults,
    LintRunEvent,
} from "@miragon/bpmn-modeler-types";

import { BrowserLinter } from "./browserLinter";
import { type LintConfigOption, resolveLintConfig } from "./lintConfigResolution";
import type { ModelerMode } from "../mode";

// bpmn-js-bpmnlint ships no types for this service.
interface Linting {
    lint: () => Promise<LintResults>;
    update(): void;
    isActive(): boolean;
    toggle(active: boolean): void;
}

interface Canvas {
    getContainer(): HTMLElement;
}

interface Bpmnjs {
    getDefinitions(): unknown;
}

interface EventBus {
    on(event: string, callback: (event: unknown) => void): void;
}

type Translate = (template: string) => string;

/**
 * The per-instance tier decision, registered as the `lintTier` DI value by
 * {@link createLintModule}. `"external"` renders host-pushed results;
 * `"in-page"` runs {@link BrowserLinter} in the webview against the config
 * `resolveLintConfig` picks from `mode`, `engine`, and the optional `config`.
 * `false`/off never reaches here — a disabled instance registers no lint module
 * at all.
 *
 * `engine` is optional: the engine-neutral Design surface (`/design`) has no
 * execution platform, and its mode default already drops the engine layer. A
 * `config` may be a single {@link BpmnlintConfig} or a per-mode map, so one
 * Camunda-tagged instance can lint Design and Implement differently and
 * re-resolve on a live {@link LintConfigService.setMode}.
 */
export interface LintTierInit {
    tier: "external" | "in-page";
    engine?: Engine;
    mode: ModelerMode;
    config?: LintConfigOption;
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

// Remember user-disabled state so re-import cannot silently reactivate linting.
type LintTierState = "external" | "in-page" | "in-page-disabled";

const OFF_ICON = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><line x1="4" y1="4" x2="12" y2="12"/></svg>`;

// The vendor mutates reports when formatting overlays; clone them to preserve emitted results.
function shallowCopyResults(results: LintResults): LintResults {
    const copy: LintResults = {};
    for (const [rule, reports] of Object.entries(results)) {
        copy[rule] = reports.map((report) => ({ ...report }));
    }
    return copy;
}

// Override vendor lint() so every tier reuses its overlay rendering and update lifecycle.
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

    private browserLinter?: BrowserLinter;

    private readonly engine?: Engine;

    private readonly explicitConfig?: LintConfigOption;

    private mode: ModelerMode;

    // Workspace configuration must remain authoritative across mode changes.
    private hostConfig?: BpmnlintConfig;

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
        this.mode = tierInit.mode;
        if (tierInit.tier === "in-page") {
            this.browserLinter = this.buildLinter();
        }

        this.linting.lint = () => this.runLint();

        // External instances can later switch to in-page linting, so register this listener in both tiers.
        eventBus.on("import.done", () => {
            if (this.state === "in-page") {
                this.activateInPage();
            }
        });
        if (tierInit.tier === "in-page" && this.bpmnjs.getDefinitions()) {
            this.activateInPage();
        }
    }

    // Deduplicate only while in-page: an intervening external push makes the previous token stale.
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
        if (config !== undefined) {
            this.hostConfig = config;
        }
        this.browserLinter = this.buildLinter();
        this.state = "in-page";
        if (this.bpmnjs.getDefinitions()) {
            this.activateInPage();
        }
    }

    setMode(mode: ModelerMode): void {
        if (mode === this.mode) {
            return;
        }
        this.mode = mode;
        if (this.state === "in-page" && this.hostConfig === undefined) {
            this.browserLinter = this.buildLinter();
            if (this.bpmnjs.getDefinitions()) {
                this.activateInPage();
            }
        }
    }

    private buildLinter(): BrowserLinter {
        return new BrowserLinter(
            this.hostConfig ?? resolveLintConfig(this.mode, this.engine, this.explicitConfig),
        );
    }

    applyLintResults(results: LintResults | null): void {
        this.state = "external";
        this.render(results);
    }

    applyLintingDisabled(): void {
        this.state = "external";
        this.renderDisabled();
    }

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

    private render(results: LintResults | null): void {
        this.hideDisabledChip();
        if (!results) {
            this.results = {};
            if (this.linting.isActive()) {
                // toggle already triggers update to clear overlays.
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
            // Activation triggers update; an explicit second update would duplicate the first run.
            this.linting.toggle(true);
        }
        this.showOffButton();
    }

    // Disabling hides the vendor pill, so provide a separate way to re-enable linting.
    private renderDisabled(): void {
        this.results = {};
        if (this.linting.isActive()) {
            this.linting.toggle(false);
        }
        this.canvas.getContainer().classList.remove("bpmnlint-active");
        this.hideOffButton();
        this.showDisabledChip();
    }

    private handleOffClick(): void {
        this.callbacks.onLintingToggled?.(false);
        if (this.state === "in-page") {
            this.state = "in-page-disabled";
            this.renderDisabled();
        }
    }

    // Rebuild on re-enable so a mode change made while disabled takes effect.
    private handleEnableClick(): void {
        this.callbacks.onLintingToggled?.(true);
        if (this.state === "in-page-disabled") {
            this.state = "in-page";
            this.browserLinter = this.buildLinter();
            this.activateInPage();
        }
    }

    private pill(): HTMLElement | null {
        return this.canvas.getContainer().querySelector<HTMLElement>(".bjsl-button");
    }

    // The vendor only rewrites the pill's contents, so this wrapper survives relints.
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
