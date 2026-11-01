import { ENGINE_LABEL } from "@miragon/bpmn-modeler-types";

import { StatusView } from "../../../kernel/domain/statusView";
import { BpmnlintIndicator } from "./bpmnlintIndicator";

export function bpmnlintStatusView(indicator: BpmnlintIndicator): StatusView {
    switch (indicator.state) {
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
                // tick of a fully applied one — the exact ambiguity this state exists to remove.
                tone: "warning",
            };
        }
        case "default": {
            const engine = indicator.platform
                ? ENGINE_LABEL[indicator.platform]
                : "no execution platform";
            return {
                text: "BPMNlint (default)",
                // A shield (not the tick) so a bundled default is never mistaken for
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
        case "failed":
            return {
                text: "BPMNlint: failed",
                icon: "warning",
                // One text for both hosts, so it names no host-specific log.
                tooltip:
                    "The .bpmnlintrc could not be read, or the lint run failed. See the log for details.",
                // A run without findings must not look calmer than a partly applied config.
                tone: "warning",
            };
    }
}
