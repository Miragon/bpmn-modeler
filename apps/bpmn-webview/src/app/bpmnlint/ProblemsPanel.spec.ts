import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@miragon/bpmn-modeler-i18n";

import { ProblemsPanel, ProblemsPanelIssue } from "./ProblemsPanel";

function makePanel() {
    const parent = document.createElement("div");
    document.body.append(parent);
    const callbacks = {
        onSelectIssue: vi.fn(),
        onToggleOverlays: vi.fn(),
        onResize: vi.fn(),
    };
    return { panel: new ProblemsPanel(parent, callbacks), parent, callbacks };
}

const issue = (overrides: Partial<ProblemsPanelIssue> = {}): ProblemsPanelIssue => ({
    elementId: "Task_1",
    elementLabel: "Task_1",
    message: "Something is off",
    severity: "error",
    rule: "some-rule",
    ...overrides,
});

beforeEach(() => {
    document.body.innerHTML = "";
});

afterEach(() => {
    i18n.setLanguage("en");
});

describe("ProblemsPanel", () => {
    it("stays hidden until results arrive", () => {
        const { panel, parent, callbacks } = makePanel();

        expect(parent.querySelector(".lint-problems--visible")).toBeNull();

        panel.update([issue()]);

        expect(parent.querySelector(".lint-problems--visible")).not.toBeNull();
        expect(callbacks.onResize).toHaveBeenCalledTimes(1);
    });

    it("shows counts for each reported severity", () => {
        const { panel, parent } = makePanel();

        panel.update([issue(), issue({ severity: "warn" }), issue({ severity: "warn" })]);

        const badges = parent.querySelectorAll(".lint-problems__badge");
        expect(badges).toHaveLength(2);
        expect(badges[0].className).toContain("--error");
        expect(badges[0].textContent).toBe("1");
        expect(badges[1].className).toContain("--warning");
        expect(badges[1].textContent).toBe("2");
    });

    it("shows an empty state when no problems are reported", () => {
        const { panel, parent } = makePanel();

        panel.update([]);

        expect(parent.querySelector(".lint-problems__badge--success")).not.toBeNull();
        expect(parent.querySelector(".lint-problems__empty")?.textContent).toContain(
            "No problems found.",
        );
    });

    it("expands the problem list without changing marker visibility", () => {
        const { panel, parent, callbacks } = makePanel();
        panel.update([issue()]);
        const toggle = parent.querySelector<HTMLButtonElement>(".lint-problems__toggle")!;
        const body = parent.querySelector<HTMLElement>(".lint-problems__body")!;

        toggle.click();

        expect(body.hidden).toBe(false);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        expect(callbacks.onToggleOverlays).not.toHaveBeenCalled();
        expect(callbacks.onResize).toHaveBeenCalledTimes(2);

        toggle.click();
        expect(body.hidden).toBe(true);
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
    });

    it("navigates to the affected element when a problem row is clicked", () => {
        const { panel, parent, callbacks } = makePanel();
        panel.update([issue({ elementId: "Task_7" })]);

        parent.querySelector<HTMLButtonElement>(".lint-problems__row")!.click();

        expect(callbacks.onSelectIssue).toHaveBeenCalledWith("Task_7");
    });

    it("exposes each problem severity to assistive technology", () => {
        const { panel, parent } = makePanel();
        panel.update([
            issue({ message: "Broken", severity: "error" }),
            issue({ message: "Risky", severity: "warn" }),
            issue({ message: "FYI", severity: "info" }),
        ]);

        const labels = [...parent.querySelectorAll<HTMLButtonElement>(".lint-problems__row")].map(
            (row) => row.getAttribute("aria-label"),
        );
        expect(labels).toEqual([
            "Errors: Broken, Task_1, some-rule",
            "Warnings: Risky, Task_1, some-rule",
            "Information: FYI, Task_1, some-rule",
        ]);
    });

    it("translates lint messages consistently with marker overlays", () => {
        const { panel, parent } = makePanel();
        i18n.setLanguage("de");

        panel.update([issue({ message: "Task" })]);

        const row = parent.querySelector<HTMLButtonElement>(".lint-problems__row")!;
        expect(row.title).toBe("Aufgabe");
        expect(row.querySelector(".lint-problems__row-message")?.textContent).toBe("Aufgabe");
    });

    it("toggles marker visibility through the separate eye button", () => {
        const { panel, parent, callbacks } = makePanel();
        panel.update([issue()]);
        const eye = parent.querySelector<HTMLButtonElement>(".lint-problems__overlays")!;

        expect(eye.title).toBe("Hide lint overlays");

        eye.click();
        expect(callbacks.onToggleOverlays).toHaveBeenCalledWith(false);
        expect(eye.classList.contains("lint-problems__overlays--off")).toBe(true);
        expect(eye.title).toBe("Show lint overlays");

        eye.click();
        expect(callbacks.onToggleOverlays).toHaveBeenLastCalledWith(true);
    });
});
