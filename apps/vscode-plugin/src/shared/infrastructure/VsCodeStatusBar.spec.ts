import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeploymentFreshness, StatusView } from "@miragon/bpmn-modeler-core";

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

const plainView: StatusView = { text: "BPMNlint", tone: "neutral" };

describe("VsCodeStatusBar slots", () => {
    it.each([
        ["loading", "$(loading~spin) BPMNlint"],
        ["check", "$(check) BPMNlint"],
        ["engine", "$(server-environment) BPMNlint"],
        ["warning", "$(warning) BPMNlint"],
        ["shield", "$(shield) BPMNlint"],
        ["off", "$(circle-slash) BPMNlint"],
        ["info", "$(info) BPMNlint"],
        ["dot", "$(circle-filled) BPMNlint"],
    ] as const)("renders the %s icon as its codicon", (icon, text) => {
        statusBar.show("bpmnlint", { ...plainView, icon });

        expect(renderedStatusBar()).toEqual([rightEntry(text)]);
    });

    it("shows the text alone, with no default colour, tooltip or command", () => {
        statusBar.show("bpmnlint", plainView);

        expect(renderedStatusBar()).toEqual([rightEntry("BPMNlint")]);
    });

    it.each([
        ["neutral", {}],
        ["success", { color: "testing.iconPassed" }],
        ["attention", { color: "charts.yellow" }],
        ["info", { color: "charts.blue" }],
        ["warning", { background: "statusBarItem.warningBackground" }],
    ] as const)("renders the %s tone", (tone, colors) => {
        statusBar.show("bpmnlint", { ...plainView, tone });

        expect(renderedStatusBar()).toEqual([rightEntry("BPMNlint", colors)]);
    });

    it.each([
        ["changeEngineVersion", "bpmn-modeler.changeEngineVersion"],
        ["toggleLinting", "bpmn-modeler.toggleLinting"],
        ["deploymentMenu", "bpmn-modeler.deploymentStatusMenu"],
    ] as const)("runs the command of the %s action on click", (action, command) => {
        statusBar.show("bpmnlint", { ...plainView, action });

        expect(renderedStatusBar()).toEqual([rightEntry("BPMNlint", { command })]);
    });

    it("shows the tooltip of the view", () => {
        statusBar.show("bpmnlint", { ...plainView, tooltip: "/work/.bpmnlintrc" });

        expect(renderedStatusBar()).toEqual([
            rightEntry("BPMNlint", { tooltip: "/work/.bpmnlintrc" }),
        ]);
    });

    it("keeps nothing of the previous view of a slot", () => {
        statusBar.show("bpmnlint", {
            text: "BPMNlint: 1 rule skipped",
            icon: "warning",
            tooltip: "/work/.bpmnlintrc",
            tone: "warning",
            action: "toggleLinting",
        });

        statusBar.show("bpmnlint", plainView);

        expect(renderedStatusBar()).toEqual([rightEntry("BPMNlint")]);
    });

    it("places templates on the left and engine, bpmnlint, deployment in that order on the right", () => {
        statusBar.show("deploymentTarget", { text: "dev", tone: "neutral" });
        statusBar.show("bpmnlint", { text: "BPMNlint", tone: "neutral" });
        statusBar.show("engineVersion", { text: "Camunda 7 (7.22.0)", tone: "neutral" });
        statusBar.show("elementTemplates", { text: "Element templates (3)", tone: "neutral" });

        expect(renderedStatusBar().map(({ side, text }) => `${side}: ${text}`)).toEqual([
            "left: Element templates (3)",
            "right: Camunda 7 (7.22.0)",
            "right: BPMNlint",
            "right: dev",
        ]);
    });

    it("hides a slot and leaves the others", () => {
        statusBar.show("engineVersion", { text: "Camunda 7 (7.22.0)", tone: "neutral" });
        statusBar.show("bpmnlint", plainView);

        statusBar.hide("engineVersion");
        statusBar.hide("deploymentTarget");

        expect(renderedStatusBar()).toEqual([rightEntry("BPMNlint")]);
    });

    describe("transient views", () => {
        const count = (n: number): StatusView => ({
            text: `Element templates (${n})`,
            icon: "check",
            tone: "neutral",
            transient: true,
        });
        const spinner: StatusView = {
            text: "Loading element templates…",
            icon: "loading",
            tone: "neutral",
        };

        beforeEach(() => {
            vi.useFakeTimers();
        });

        it("hides a transient view after three seconds", () => {
            statusBar.show("elementTemplates", count(12));

            vi.advanceTimersByTime(2999);
            expect(renderedStatusBar()).toHaveLength(1);
            vi.advanceTimersByTime(1);
            expect(renderedStatusBar()).toEqual([]);
        });

        it("keeps a view that is not transient", () => {
            statusBar.show("elementTemplates", spinner);

            vi.advanceTimersByTime(60_000);

            expect(renderedStatusBar().map((entry) => entry.text)).toEqual([
                "$(loading~spin) Loading element templates…",
            ]);
        });

        it("keeps a view that replaces a transient one within three seconds", () => {
            statusBar.show("elementTemplates", count(1));
            vi.advanceTimersByTime(2000);

            statusBar.show("elementTemplates", spinner);
            vi.advanceTimersByTime(1000);

            expect(renderedStatusBar().map((entry) => entry.text)).toEqual([
                "$(loading~spin) Loading element templates…",
            ]);
        });

        it("shows a second transient view for its own three seconds", () => {
            statusBar.show("elementTemplates", count(1));
            vi.advanceTimersByTime(2000);

            statusBar.show("elementTemplates", count(2));
            vi.advanceTimersByTime(1000);

            expect(renderedStatusBar().map((entry) => entry.text)).toEqual([
                "$(check) Element templates (2)",
            ]);
            vi.advanceTimersByTime(2000);
            expect(renderedStatusBar()).toEqual([]);
        });

        it("leaves no auto-hide pending once the slot is hidden", () => {
            statusBar.show("elementTemplates", count(1));

            statusBar.hide("elementTemplates");

            expect(vi.getTimerCount()).toBe(0);
        });

        it("times the auto-hide of each slot on its own", () => {
            statusBar.show("elementTemplates", count(1));
            vi.advanceTimersByTime(2000);

            statusBar.show("bpmnlint", { ...plainView, transient: true });
            statusBar.hide("engineVersion");
            vi.advanceTimersByTime(1000);

            expect(renderedStatusBar().map((entry) => entry.text)).toEqual(["BPMNlint"]);
            vi.advanceTimersByTime(2000);
            expect(renderedStatusBar()).toEqual([]);
        });
    });
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

    describe("a later show or hide cancels a pending auto-hide", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it("keeps a spinner that starts within three seconds of a count", () => {
            statusBar.showElementTemplatesReady(1);
            vi.advanceTimersByTime(2000);

            statusBar.showElementTemplatesLoading();
            vi.advanceTimersByTime(1000);

            expect(renderedStatusBar().map((entry) => entry.text)).toEqual([
                "$(loading~spin) Loading element templates…",
            ]);
        });

        it("shows a second count for its own three seconds", () => {
            statusBar.showElementTemplatesReady(1);
            vi.advanceTimersByTime(2000);

            statusBar.showElementTemplatesReady(2);
            vi.advanceTimersByTime(1000);

            expect(renderedStatusBar().map((entry) => entry.text)).toEqual([
                "$(check) Element templates (2)",
            ]);
            vi.advanceTimersByTime(2000);
            expect(renderedStatusBar()).toEqual([]);
        });

        it("leaves no auto-hide pending once the status is hidden", () => {
            statusBar.showElementTemplatesReady(1);

            statusBar.hideElementTemplatesStatus();

            expect(vi.getTimerCount()).toBe(0);
        });
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
        (bar) => bar.showBpmnlint({ state: "active", configPath: CONFIG_PATH }),
        rightEntry("$(check) BPMNlint", { tooltip: CONFIG_PATH }),
    ],
    [
        "one skipped rule",
        (bar) =>
            bar.showBpmnlint({
                state: "unresolved",
                configPath: CONFIG_PATH,
                unresolved: ["camunda-compat/history-time-to-live"],
            }),
        rightEntry("$(warning) BPMNlint: 1 rule skipped", {
            tooltip: `${CONFIG_PATH}\n\nUnresolved (install the plugin providing these): camunda-compat/history-time-to-live`,
            background: "statusBarItem.warningBackground",
        }),
    ],
    [
        "several skipped rules",
        (bar) =>
            bar.showBpmnlint({
                state: "unresolved",
                configPath: CONFIG_PATH,
                unresolved: ["plugin:acme/recommended", "acme/naming"],
            }),
        rightEntry("$(warning) BPMNlint: 2 rules skipped", {
            tooltip: `${CONFIG_PATH}\n\nUnresolved (install the plugin providing these): plugin:acme/recommended, acme/naming`,
            background: "statusBarItem.warningBackground",
        }),
    ],
    [
        "the bundled default for an engine",
        (bar) => bar.showBpmnlint({ state: "default", platform: "c8" }),
        rightEntry("$(shield) BPMNlint (default)", {
            tooltip:
                "Linting against the bundled default (Camunda 8).\nAdd a .bpmnlintrc to your workspace to override it.",
        }),
    ],
    [
        "the bundled default without an execution platform",
        (bar) => bar.showBpmnlint({ state: "default", platform: undefined }),
        rightEntry("$(shield) BPMNlint (default)", {
            tooltip:
                "Linting against the bundled default (no execution platform).\nAdd a .bpmnlintrc to your workspace to override it.",
        }),
    ],
    [
        "linting turned off",
        (bar) => bar.showBpmnlint({ state: "disabled" }),
        rightEntry("$(circle-slash) BPMNlint: off", {
            tooltip: "BPMN linting is turned off — click to turn it back on.",
            command: "bpmn-modeler.toggleLinting",
        }),
    ],
    [
        "a workspace without a config",
        (bar) => bar.showBpmnlint({ state: "noConfig" }),
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
            (bar: VsCodeStatusBar) =>
                bar.showBpmnlint({
                    state: "unresolved",
                    configPath: CONFIG_PATH,
                    unresolved: ["acme/naming"],
                }),
        ],
        ["linting turned off", (bar: VsCodeStatusBar) => bar.showBpmnlint({ state: "disabled" })],
    ])("after %s", (_previous, showPrevious) => {
        it.each(bpmnlintStates)("shows %s alone", (_state, show, expected) => {
            showPrevious(statusBar);

            show(statusBar);

            expect(renderedStatusBar()).toEqual([expected]);
        });
    });

    it("hides the bpmnlint status", () => {
        statusBar.showBpmnlint({ state: "active", configPath: CONFIG_PATH });

        statusBar.showBpmnlint({ state: "hidden" });

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
        statusBar.showBpmnlint({ state: "noConfig" });
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
        statusBar.showBpmnlint({ state: "hidden" });
        statusBar.hideDeploymentTarget();

        expect(renderedStatusBar()).toEqual([]);
    });
});
