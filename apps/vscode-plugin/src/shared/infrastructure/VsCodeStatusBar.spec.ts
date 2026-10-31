import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StatusView } from "@miragon/bpmn-modeler-core";

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

    it.each<[string, StatusView]>([
        [
            "the background",
            {
                text: "BPMNlint: 1 rule skipped",
                icon: "warning",
                tooltip: "/work/.bpmnlintrc",
                tone: "warning",
                action: "toggleLinting",
            },
        ],
        ["the text colour", { text: "dev", icon: "dot", tone: "success" }],
    ])("keeps nothing of the previous view of a slot, %s included", (_case, previousView) => {
        statusBar.show("bpmnlint", previousView);

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

    it("shows a slot again after it was hidden", () => {
        statusBar.show("elementTemplates", { text: "Loading element templates…", tone: "neutral" });
        statusBar.hide("elementTemplates");

        statusBar.show("elementTemplates", { text: "Element templates (3)", tone: "neutral" });

        expect(renderedStatusBar().map(({ side, text }) => `${side}: ${text}`)).toEqual([
            "left: Element templates (3)",
        ]);
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
