import { StatusBarAlignment, StatusBarItem, ThemeColor, window } from "vscode";

import { Engine, ENGINE_LABEL } from "@miragon/bpmn-modeler-types";

import {
    BpmnlintIndicator,
    BpmnlintStatusBarPort,
    DeploymentFreshness,
    DeploymentStatusBarPort,
    LegacyStatusBarPort,
    StatusAction,
    StatusBarPort,
    StatusIcon,
    StatusSlot,
    StatusTone,
    StatusView,
} from "@miragon/bpmn-modeler-core";

const TRANSIENT_VIEW_VISIBLE_MS = 3000;

// VS Code's guideline: workspace-wide status on the left, the focused file's state on the right.
const SLOT_PLACEMENT: Record<
    StatusSlot,
    { readonly alignment: StatusBarAlignment; readonly priority: number }
> = {
    elementTemplates: { alignment: StatusBarAlignment.Left, priority: 100 },
    engineVersion: { alignment: StatusBarAlignment.Right, priority: 200 },
    bpmnlint: { alignment: StatusBarAlignment.Right, priority: 199 },
    deploymentTarget: { alignment: StatusBarAlignment.Right, priority: 198 },
};

const CODICONS: Record<StatusIcon, string> = {
    loading: "loading~spin",
    check: "check",
    engine: "server-environment",
    warning: "warning",
    shield: "shield",
    off: "circle-slash",
    info: "info",
    dot: "circle-filled",
};

// A status bar item colours its whole text, so an icon and its (short) text share
// one colour — acceptable, and cheaper than a second item.
const TONE_COLORS: Record<StatusTone, { readonly color?: string; readonly background?: string }> = {
    neutral: {},
    success: { color: "testing.iconPassed" },
    attention: { color: "charts.yellow" },
    info: { color: "charts.blue" },
    warning: { background: "statusBarItem.warningBackground" },
};

const ACTION_COMMANDS: Record<StatusAction, string> = {
    changeEngineVersion: "bpmn-modeler.changeEngineVersion",
    toggleLinting: "bpmn-modeler.toggleLinting",
    deploymentMenu: "bpmn-modeler.deploymentStatusMenu",
};

const DEPLOYMENT_FRESHNESS_TONES: Record<DeploymentFreshness, StatusTone> = {
    deployed: "success",
    changed: "attention",
    superseded: "info",
    unknown: "neutral",
};

function deploymentTooltip(
    freshness: DeploymentFreshness,
    deployedAt?: string,
    verifiedAt?: string,
): string {
    const when = deployedAt ? new Date(deployedAt).toLocaleString() : undefined;
    const verifiedSuffix = verifiedAt ? ` — verified ${new Date(verifiedAt).toLocaleString()}` : "";
    switch (freshness) {
        case "deployed":
            return (
                (when
                    ? `Deployed — last deployed ${when}`
                    : "Deployed — matches the last deployment") + verifiedSuffix
            );
        case "changed":
            return (
                (when
                    ? `Undeployed changes — last deployed ${when}`
                    : "Undeployed changes since the last deployment") + verifiedSuffix
            );
        case "superseded":
            return (
                (when
                    ? `Deployed version differs from your diagram (deployed ${when})`
                    : "Deployed version differs from your diagram") + verifiedSuffix
            );
        case "unknown":
            return "Never deployed to this target from this machine — click to switch target";
    }
}

function bpmnlintView(indicator: BpmnlintIndicator): StatusView | undefined {
    switch (indicator.state) {
        case "hidden":
            return undefined;
        case "active":
            return {
                text: "BPMNlint",
                icon: "check",
                tooltip: indicator.configPath,
                tone: "neutral",
            };
        case "unresolved": {
            const { configPath, unresolved } = indicator;
            return {
                text: `BPMNlint: ${unresolved.length} rule${unresolved.length === 1 ? "" : "s"} skipped`,
                icon: "warning",
                tooltip: `${configPath}\n\nUnresolved (install the plugin providing these): ${unresolved.join(", ")}`,
                // A warning tone so a partly-applied config can't be mistaken for the
                // fully-green tick — the exact ambiguity this state exists to remove.
                tone: "warning",
            };
        }
        case "default": {
            const engine = indicator.platform
                ? ENGINE_LABEL[indicator.platform]
                : "no execution platform";
            return {
                text: "BPMNlint (default)",
                // A shield (not the green tick) so a bundled default is never mistaken for
                // a project's own `.bpmnlintrc`.
                icon: "shield",
                tooltip: `Linting against the bundled default (${engine}).\nAdd a .bpmnlintrc to your workspace to override it.`,
                tone: "neutral",
            };
        }
        case "disabled":
            return {
                text: "BPMNlint: off",
                // Circle-slash (not the info `i`) reads as "deliberately off", and the
                // action turns it back on with one click for users who never open settings.
                icon: "off",
                tooltip: "BPMN linting is turned off — click to turn it back on.",
                tone: "neutral",
                action: "toggleLinting",
            };
        case "noConfig":
            return { text: "BPMNlint: no .bpmnlintrc", icon: "info", tone: "neutral" };
    }
}

export class VsCodeStatusBar
    implements StatusBarPort, LegacyStatusBarPort, BpmnlintStatusBarPort, DeploymentStatusBarPort
{
    private readonly items = new Map<StatusSlot, StatusBarItem>();

    private readonly pendingAutoHides = new Map<StatusSlot, ReturnType<typeof setTimeout>>();

    show(slot: StatusSlot, view: StatusView): void {
        this.cancelPendingAutoHide(slot);
        const item = this.itemFor(slot);
        const { color, background } = TONE_COLORS[view.tone];
        item.text = view.icon ? `$(${CODICONS[view.icon]}) ${view.text}` : view.text;
        item.tooltip = view.tooltip;
        item.color = color ? new ThemeColor(color) : undefined;
        item.backgroundColor = background ? new ThemeColor(background) : undefined;
        item.command = view.action ? ACTION_COMMANDS[view.action] : undefined;
        item.show();
        if (view.transient) {
            this.pendingAutoHides.set(
                slot,
                setTimeout(() => this.hide(slot), TRANSIENT_VIEW_VISIBLE_MS),
            );
        }
    }

    hide(slot: StatusSlot): void {
        this.cancelPendingAutoHide(slot);
        this.items.get(slot)?.hide();
    }

    showElementTemplatesLoading(): void {
        this.show("elementTemplates", {
            text: "Loading element templates…",
            icon: "loading",
            tone: "neutral",
        });
    }

    showElementTemplatesReady(count: number): void {
        this.show("elementTemplates", {
            text: `Element templates (${count})`,
            icon: "check",
            tone: "neutral",
            transient: true,
        });
    }

    hideElementTemplatesStatus(): void {
        this.hide("elementTemplates");
    }

    showEngineVersion(platform: Engine, version: string): void {
        this.show("engineVersion", {
            text: `${ENGINE_LABEL[platform]} (${version})`,
            icon: "engine",
            tooltip: "Click to change engine version",
            tone: "neutral",
            action: "changeEngineVersion",
        });
    }

    hideEngineVersion(): void {
        this.hide("engineVersion");
    }

    showBpmnlint(indicator: BpmnlintIndicator): void {
        const view = bpmnlintView(indicator);
        if (view) this.show("bpmnlint", view);
        else this.hide("bpmnlint");
    }

    showDeploymentTarget(
        name: string | undefined,
        freshness: DeploymentFreshness,
        deployedAt?: string,
        verifiedAt?: string,
    ): void {
        this.show("deploymentTarget", {
            text: name ?? "No deployment target",
            icon: "dot",
            tooltip: deploymentTooltip(freshness, deployedAt, verifiedAt),
            tone: DEPLOYMENT_FRESHNESS_TONES[freshness],
            action: "deploymentMenu",
        });
    }

    hideDeploymentTarget(): void {
        this.hide("deploymentTarget");
    }

    // Every show of a slot reuses its item, so a stale timer would hide what a later show put there.
    private cancelPendingAutoHide(slot: StatusSlot): void {
        clearTimeout(this.pendingAutoHides.get(slot));
        this.pendingAutoHides.delete(slot);
    }

    private itemFor(slot: StatusSlot): StatusBarItem {
        let item = this.items.get(slot);
        if (!item) {
            const { alignment, priority } = SLOT_PLACEMENT[slot];
            item = window.createStatusBarItem(alignment, priority);
            this.items.set(slot, item);
        }
        return item;
    }
}
