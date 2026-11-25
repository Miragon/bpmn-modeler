import type {
    BpmnlintConfig,
    LintResults,
    LintRunEvent,
    Translate,
} from "@miragon/bpmn-modeler-types";
import {
    type EditableSurfaceMode,
    ExecutionPlatformAttributes,
    type ExecutionPlatformDefinitions,
    SURFACE_MODE_CHANGED,
    SURFACE_MODE_SERVICE,
    type SurfaceModeChangedEvent,
    type SurfaceModeService,
} from "@miragon/bpmn-modeler-types/domain";

import type { LintHandleMethods } from "../../kernel/service/lintHandle";
import { BrowserLinter } from "../adapter/out/browserLinter";
import {
    type LintTierEffect,
    type LintTierEvent,
    type LintTierInit,
    LintTierMachine,
} from "../domain/lintTierMachine";

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
    getDefinitions(): ExecutionPlatformDefinitions | undefined;
}

interface EventBus {
    on(event: "import.done", callback: () => void): void;
    on(
        event: typeof SURFACE_MODE_CHANGED,
        priority: number,
        callback: (event: SurfaceModeChangedEvent) => void,
    ): void;
}

interface OptionalInjector {
    get<T>(name: string, strict: false): T | null;
}

// Below the default 1000, so the panel filter and the mode attribute follow a change first.
const LINT_MODE_PRIORITY = 500;

export type { LintTierInit } from "../domain/lintTierMachine";

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

// Override vendor lint() so every tier reuses its overlay rendering and update lifecycle.
export class LintConfigService implements LintHandleMethods {
    static $inject = [
        "linting",
        "lintTier",
        "lintCallbacks",
        "translate",
        "canvas",
        "bpmnjs",
        "eventBus",
        "injector",
    ];

    private static readonly OFF_ICON = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><line x1="4" y1="4" x2="12" y2="12"/></svg>`;

    private machine: LintTierMachine;

    private browserLinter?: BrowserLinter;

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
        injector: OptionalInjector,
    ) {
        const start = LintTierMachine.start(tierInit, this.isDiagramLoaded());
        this.machine = start.machine;

        this.linting.lint = () => this.runLint();

        // External instances can later switch to in-page linting, so register this listener in both tiers.
        eventBus.on("import.done", () => {
            this.dispatch({ type: "diagramImported", engineVersion: this.importedEngineVersion() });
        });
        if (injector.get<SurfaceModeService>(SURFACE_MODE_SERVICE, false)) {
            eventBus.on(SURFACE_MODE_CHANGED, LINT_MODE_PRIORITY, (event) => {
                this.setMode(event.mode);
            });
        }
        this.runEffects(start.effects);
    }

    startInPageLinting(config?: BpmnlintConfig, configToken?: string): void {
        this.dispatch({ type: "inPageLintingRequested", config, configToken });
    }

    setMode(mode: EditableSurfaceMode): void {
        this.dispatch({ type: "modeChanged", mode });
    }

    applyLintResults(results: LintResults | null): void {
        this.dispatch({ type: "hostResultsPushed", results });
    }

    applyLintingDisabled(): void {
        this.dispatch({ type: "hostDisabledLinting" });
    }

    private dispatch(event: LintTierEvent): void {
        const transition = this.machine.reduce(event, this.isDiagramLoaded());
        this.machine = transition.machine;
        this.runEffects(transition.effects);
    }

    private runEffects(effects: readonly LintTierEffect[]): void {
        for (const effect of effects) {
            switch (effect.kind) {
                case "buildLinter":
                    this.browserLinter = new BrowserLinter(effect.config);
                    break;
                case "activateInPage":
                    this.activateInPage();
                    break;
                case "renderResults":
                    this.render(effect.results);
                    break;
                case "renderDisabled":
                    this.renderDisabled();
                    break;
            }
        }
    }

    private isDiagramLoaded(): boolean {
        return Boolean(this.bpmnjs.getDefinitions());
    }

    private importedEngineVersion(): string | undefined {
        const definitions = this.bpmnjs.getDefinitions();
        return definitions ? new ExecutionPlatformAttributes(definitions).version() : undefined;
    }

    private async runLint(): Promise<LintResults> {
        if (this.machine.lintsInPage() && this.browserLinter) {
            const event = await this.browserLinter.run(this.bpmnjs.getDefinitions());
            this.callbacks.onLintResults?.(event);
            return event.results;
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

    // Report first, so a synchronous host answer lands before the toggle's own transition.
    private handleOffClick(): void {
        this.callbacks.onLintingToggled?.(false);
        this.dispatch({ type: "userTurnedLintingOff" });
    }

    private handleEnableClick(): void {
        this.callbacks.onLintingToggled?.(true);
        this.dispatch({ type: "userTurnedLintingOn" });
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
            button.innerHTML = LintConfigService.OFF_ICON;
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
