import { describe, expect, it } from "vitest";

import { StatusView } from "../../../kernel/domain/statusView";
import { BpmnlintIndicator } from "./bpmnlintIndicator";
import { bpmnlintStatusView } from "./bpmnlintStatusView";

const CONFIG_PATH = "/work/.bpmnlintrc";

interface ViewCase {
    readonly name: string;
    readonly indicator: BpmnlintIndicator;
    readonly view: StatusView;
}

const cases: ViewCase[] = [
    {
        name: "names the applied project config in the tooltip",
        indicator: { state: "active", configPath: CONFIG_PATH },
        view: { text: "BPMNlint", icon: "check", tooltip: CONFIG_PATH, tone: "neutral" },
    },
    {
        name: "warns about one skipped rule and names it",
        indicator: {
            state: "unresolved",
            configPath: CONFIG_PATH,
            unresolved: ["camunda-compat/history-time-to-live"],
        },
        view: {
            text: "BPMNlint: 1 rule skipped",
            icon: "warning",
            tooltip: `${CONFIG_PATH}\n\nUnresolved (install the plugin providing these): camunda-compat/history-time-to-live`,
            tone: "warning",
        },
    },
    {
        name: "counts several skipped rules in the plural",
        indicator: {
            state: "unresolved",
            configPath: CONFIG_PATH,
            unresolved: ["plugin:acme/recommended", "acme/naming"],
        },
        view: {
            text: "BPMNlint: 2 rules skipped",
            icon: "warning",
            tooltip: `${CONFIG_PATH}\n\nUnresolved (install the plugin providing these): plugin:acme/recommended, acme/naming`,
            tone: "warning",
        },
    },
    {
        name: "names Camunda 7 for the bundled default of a Camunda 7 diagram",
        indicator: { state: "default", platform: "c7" },
        view: {
            text: "BPMNlint (default)",
            icon: "shield",
            tooltip:
                "Linting against the bundled default (Camunda 7).\nAdd a .bpmnlintrc to your workspace to override it.",
            tone: "neutral",
        },
    },
    {
        name: "names Camunda 8 for the bundled default of a Camunda 8 diagram",
        indicator: { state: "default", platform: "c8" },
        view: {
            text: "BPMNlint (default)",
            icon: "shield",
            tooltip:
                "Linting against the bundled default (Camunda 8).\nAdd a .bpmnlintrc to your workspace to override it.",
            tone: "neutral",
        },
    },
    {
        name: "says so when the bundled default lints a diagram without an execution platform",
        indicator: { state: "default", platform: undefined },
        view: {
            text: "BPMNlint (default)",
            icon: "shield",
            tooltip:
                "Linting against the bundled default (no execution platform).\nAdd a .bpmnlintrc to your workspace to override it.",
            tone: "neutral",
        },
    },
    {
        name: "offers to turn linting back on with one click",
        indicator: { state: "disabled" },
        view: {
            text: "BPMNlint: off",
            icon: "off",
            tooltip: "BPMN linting is turned off — click to turn it back on.",
            tone: "neutral",
            action: "toggleLinting",
        },
    },
    {
        name: "warns that linting failed and points to the log",
        indicator: { state: "noConfig" },
        view: {
            text: "BPMNlint: failed",
            icon: "warning",
            tooltip:
                "The .bpmnlintrc could not be read, or the lint run failed. See the log for details.",
            tone: "warning",
        },
    },
];

describe("bpmnlintStatusView", () => {
    it.each(cases)("$name", ({ indicator, view }) => {
        expect(bpmnlintStatusView(indicator)).toEqual(view);
    });
});
