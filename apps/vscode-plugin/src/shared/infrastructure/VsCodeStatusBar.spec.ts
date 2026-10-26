import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeploymentFreshness } from "@miragon/bpmn-modeler-core";

vi.mock("vscode", () => import("../../__fixtures__/vscodeWindowFake"));

import {
    renderedStatusBar,
    resetVscodeWindow,
    StatusBarEntry,
} from "../../__fixtures__/vscodeWindowFake";
import { VsCodeStatusBar } from "./VsCodeStatusBar";

function rightEntry(text: string, details: Partial<StatusBarEntry> = {}): StatusBarEntry {
    return {
        side: "right",
        text,
        tooltip: undefined,
        color: undefined,
        background: undefined,
        command: undefined,
        ...details,
    };
}

let statusBar: VsCodeStatusBar;

beforeEach(() => {
    resetVscodeWindow();
    statusBar = new VsCodeStatusBar();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("VsCodeStatusBar element templates", () => {
    it("shows a spinner on the left while element templates load", () => {
        statusBar.showElementTemplatesLoading();

        expect(renderedStatusBar()).toEqual([
            {
                side: "left",
                text: "$(loading~spin) Loading element templates…",
                tooltip: undefined,
                color: undefined,
                background: undefined,
                command: undefined,
            },
        ]);
    });

    it("replaces the spinner with the template count for three seconds", () => {
        vi.useFakeTimers();
        statusBar.showElementTemplatesLoading();

        statusBar.showElementTemplatesReady(12);

        expect(renderedStatusBar().map((entry) => entry.text)).toEqual([
            "$(check) Element templates (12)",
        ]);
        vi.advanceTimersByTime(2999);
        expect(renderedStatusBar()).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(renderedStatusBar()).toEqual([]);
    });

    it("clears the spinner when loading stops early", () => {
        statusBar.showElementTemplatesLoading();

        statusBar.hideElementTemplatesStatus();

        expect(renderedStatusBar()).toEqual([]);
    });

    // A superseded load hides the spinner while another load is still running.
    it("shows the template count after another load hid the spinner", () => {
        statusBar.showElementTemplatesLoading();
        statusBar.hideElementTemplatesStatus();

        statusBar.showElementTemplatesReady(3);

        expect(renderedStatusBar()).toEqual([
            {
                side: "left",
                text: "$(check) Element templates (3)",
                tooltip: undefined,
                color: undefined,
                background: undefined,
                command: undefined,
            },
        ]);
    });
});

describe("VsCodeStatusBar engine version", () => {
    it.each([
        ["c7", "7.22.0", "$(server-environment) Camunda 7 (7.22.0)"],
        ["c8", "8.6.0", "$(server-environment) Camunda 8 (8.6.0)"],
    ] as const)("shows %s version %s with a click to change it", (engine, version, text) => {
        statusBar.showEngineVersion(engine, version);

        expect(renderedStatusBar()).toEqual([
            rightEntry(text, {
                tooltip: "Click to change engine version",
                command: "bpmn-modeler.changeEngineVersion",
            }),
        ]);
    });

    it("hides the engine version", () => {
        statusBar.showEngineVersion("c7", "7.22.0");

        statusBar.hideEngineVersion();

        expect(renderedStatusBar()).toEqual([]);
    });
});

const CONFIG_PATH = "/work/.bpmnlintrc";

const bpmnlintStates: [string, (bar: VsCodeStatusBar) => void, StatusBarEntry][] = [
    [
        "an applied project config",
        (bar) => bar.showBpmnlintActive(CONFIG_PATH),
        rightEntry("$(check) BPMNlint", { tooltip: CONFIG_PATH }),
    ],
    [
        "one skipped rule",
        (bar) => bar.showBpmnlintUnresolved(CONFIG_PATH, ["camunda-compat/history-time-to-live"]),
        rightEntry("$(warning) BPMNlint: 1 rule skipped", {
            tooltip: `${CONFIG_PATH}\n\nUnresolved (install the plugin providing these): camunda-compat/history-time-to-live`,
            background: "statusBarItem.warningBackground",
        }),
    ],
    [
        "several skipped rules",
        (bar) =>
            bar.showBpmnlintUnresolved(CONFIG_PATH, ["plugin:acme/recommended", "acme/naming"]),
        rightEntry("$(warning) BPMNlint: 2 rules skipped", {
            tooltip: `${CONFIG_PATH}\n\nUnresolved (install the plugin providing these): plugin:acme/recommended, acme/naming`,
            background: "statusBarItem.warningBackground",
        }),
    ],
    [
        "the bundled default for an engine",
        (bar) => bar.showBpmnlintDefault("c8"),
        rightEntry("$(shield) BPMNlint (default)", {
            tooltip:
                "Linting against the bundled default (Camunda 8).\nAdd a .bpmnlintrc to your workspace to override it.",
        }),
    ],
    [
        "the bundled default without an execution platform",
        (bar) => bar.showBpmnlintDefault(undefined),
        rightEntry("$(shield) BPMNlint (default)", {
            tooltip:
                "Linting against the bundled default (no execution platform).\nAdd a .bpmnlintrc to your workspace to override it.",
        }),
    ],
    [
        "linting turned off",
        (bar) => bar.showBpmnlintDisabled(),
        rightEntry("$(circle-slash) BPMNlint: off", {
            tooltip: "BPMN linting is turned off — click to turn it back on.",
            command: "bpmn-modeler.toggleLinting",
        }),
    ],
    [
        "a workspace without a config",
        (bar) => bar.showBpmnlintNoConfig(),
        rightEntry("$(info) BPMNlint: no .bpmnlintrc"),
    ],
];

describe("VsCodeStatusBar bpmnlint", () => {
    it.each(bpmnlintStates)("shows %s", (_state, show, expected) => {
        show(statusBar);

        expect(renderedStatusBar()).toEqual([expected]);
    });

    // The warning background and the click-to-enable command must not leak into the next state.
    describe.each([
        [
            "skipped rules",
            (bar: VsCodeStatusBar) => bar.showBpmnlintUnresolved(CONFIG_PATH, ["acme/naming"]),
        ],
        ["linting turned off", (bar: VsCodeStatusBar) => bar.showBpmnlintDisabled()],
    ])("after %s", (_previous, showPrevious) => {
        it.each(bpmnlintStates)("shows %s alone", (_state, show, expected) => {
            showPrevious(statusBar);

            show(statusBar);

            expect(renderedStatusBar()).toEqual([expected]);
        });
    });

    it("hides the bpmnlint status", () => {
        statusBar.showBpmnlintActive(CONFIG_PATH);

        statusBar.hideBpmnlintStatus();

        expect(renderedStatusBar()).toEqual([]);
    });
});

const DEPLOYED_AT = "2026-09-17T14:40:00.000Z";
const VERIFIED_AT = "2026-09-17T15:00:00.000Z";
const deployedWhen = new Date(DEPLOYED_AT).toLocaleString();
const verifiedWhen = new Date(VERIFIED_AT).toLocaleString();

interface DeploymentCase {
    readonly name: string;
    readonly freshness: DeploymentFreshness;
    readonly deployedAt?: string;
    readonly verifiedAt?: string;
    readonly color: string | undefined;
    readonly tooltip: string;
}

const deploymentCases: DeploymentCase[] = [
    {
        name: "a deployed diagram in green",
        freshness: "deployed",
        color: "testing.iconPassed",
        tooltip: "Deployed — matches the last deployment",
    },
    {
        name: "a deployed diagram with its verification time",
        freshness: "deployed",
        verifiedAt: VERIFIED_AT,
        color: "testing.iconPassed",
        tooltip: `Deployed — matches the last deployment — verified ${verifiedWhen}`,
    },
    {
        name: "a deployed diagram with its deploy time",
        freshness: "deployed",
        deployedAt: DEPLOYED_AT,
        color: "testing.iconPassed",
        tooltip: `Deployed — last deployed ${deployedWhen}`,
    },
    {
        name: "a deployed diagram with its deploy and verification times",
        freshness: "deployed",
        deployedAt: DEPLOYED_AT,
        verifiedAt: VERIFIED_AT,
        color: "testing.iconPassed",
        tooltip: `Deployed — last deployed ${deployedWhen} — verified ${verifiedWhen}`,
    },
    {
        name: "undeployed changes in yellow",
        freshness: "changed",
        color: "charts.yellow",
        tooltip: "Undeployed changes since the last deployment",
    },
    {
        name: "undeployed changes with the last deploy time",
        freshness: "changed",
        deployedAt: DEPLOYED_AT,
        color: "charts.yellow",
        tooltip: `Undeployed changes — last deployed ${deployedWhen}`,
    },
    {
        name: "undeployed changes with the deploy and verification times",
        freshness: "changed",
        deployedAt: DEPLOYED_AT,
        verifiedAt: VERIFIED_AT,
        color: "charts.yellow",
        tooltip: `Undeployed changes — last deployed ${deployedWhen} — verified ${verifiedWhen}`,
    },
    // "Differs", not "newer": the engine's copy may be older or newer than the diagram.
    {
        name: "a differing engine copy in blue",
        freshness: "superseded",
        color: "charts.blue",
        tooltip: "Deployed version differs from your diagram",
    },
    {
        name: "a differing engine copy with its deploy time",
        freshness: "superseded",
        deployedAt: DEPLOYED_AT,
        color: "charts.blue",
        tooltip: `Deployed version differs from your diagram (deployed ${deployedWhen})`,
    },
    {
        name: "a differing engine copy with its deploy and verification times",
        freshness: "superseded",
        deployedAt: DEPLOYED_AT,
        verifiedAt: VERIFIED_AT,
        color: "charts.blue",
        tooltip: `Deployed version differs from your diagram (deployed ${deployedWhen}) — verified ${verifiedWhen}`,
    },
    {
        name: "a diagram never deployed to the target in the default colour",
        freshness: "unknown",
        color: undefined,
        tooltip: "Never deployed to this target from this machine — click to switch target",
    },
];

describe("VsCodeStatusBar deployment target", () => {
    it.each(deploymentCases)(
        "shows $name",
        ({ freshness, deployedAt, verifiedAt, color, tooltip }) => {
            statusBar.showDeploymentTarget("dev", freshness, deployedAt, verifiedAt);

            expect(renderedStatusBar()).toEqual([
                rightEntry("$(circle-filled) dev", {
                    tooltip,
                    color,
                    command: "bpmn-modeler.deploymentStatusMenu",
                }),
            ]);
        },
    );

    it("says so when no deployment target is active", () => {
        statusBar.showDeploymentTarget(undefined, "unknown");

        expect(renderedStatusBar().map((entry) => entry.text)).toEqual([
            "$(circle-filled) No deployment target",
        ]);
    });

    it("drops the freshness colour for a diagram that was never deployed", () => {
        statusBar.showDeploymentTarget("dev", "deployed", DEPLOYED_AT);

        statusBar.showDeploymentTarget("dev", "unknown");

        expect(renderedStatusBar().map((entry) => entry.color)).toEqual([undefined]);
    });

    it("hides the deployment target", () => {
        statusBar.showDeploymentTarget("dev", "deployed");

        statusBar.hideDeploymentTarget();

        expect(renderedStatusBar()).toEqual([]);
    });
});

describe("VsCodeStatusBar layout", () => {
    it("keeps templates on the left and engine, bpmnlint, deployment in that order on the right", () => {
        statusBar.showDeploymentTarget("dev", "deployed");
        statusBar.showBpmnlintNoConfig();
        statusBar.showEngineVersion("c7", "7.22.0");
        statusBar.showElementTemplatesLoading();

        expect(renderedStatusBar().map(({ side, text }) => `${side}: ${text}`)).toEqual([
            "left: $(loading~spin) Loading element templates…",
            "right: $(server-environment) Camunda 7 (7.22.0)",
            "right: $(info) BPMNlint: no .bpmnlintrc",
            "right: $(circle-filled) dev",
        ]);
    });

    it("leaves the status bar empty when hiding what was never shown", () => {
        statusBar.hideElementTemplatesStatus();
        statusBar.hideEngineVersion();
        statusBar.hideBpmnlintStatus();
        statusBar.hideDeploymentTarget();

        expect(renderedStatusBar()).toEqual([]);
    });
});
