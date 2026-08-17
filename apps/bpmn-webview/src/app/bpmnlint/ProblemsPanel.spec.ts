import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("ProblemsPanel", () => {
    it("stays hidden until the first update and reveals with a resize", () => {
        const { parent, callbacks, panel } = makePanel();
        const root = parent.querySelector(".lint-problems")!;
        expect(root.classList.contains("lint-problems--visible")).toBe(false);

        panel.update([issue()]);

        expect(root.classList.contains("lint-problems--visible")).toBe(true);
        expect(callbacks.onResize).toHaveBeenCalledTimes(1);
    });

    it("renders one count badge per severity that occurs", () => {
        const { panel, parent } = makePanel();

        panel.update([
            issue(),
            issue({ severity: "warn" }),
            issue({ severity: "warn" }),
        ]);

        const badges = parent.querySelectorAll(".lint-problems__badge");
        expect(badges).toHaveLength(2);
        expect(badges[0].className).toContain("--error");
        expect(badges[0].textContent).toBe("1");
        expect(badges[1].className).toContain("--warning");
        expect(badges[1].textContent).toBe("2");
    });

    it("shows a success badge and empty state when there are no findings", () => {
        const { panel, parent } = makePanel();

        panel.update([]);

        expect(parent.querySelector(".lint-problems__badge--success")).not.toBeNull();
        expect(parent.querySelector(".lint-problems__empty")?.textContent).toContain(
            "No problems found.",
        );
    });

    it("expands and collapses the finding list via the header toggle", () => {
        const { panel, parent, callbacks } = makePanel();
        panel.update([issue()]);
        const toggle = parent.querySelector<HTMLButtonElement>(".lint-problems__toggle")!;
        const body = parent.querySelector<HTMLElement>(".lint-problems__body")!;
        expect(body.hidden).toBe(true);

        toggle.click();
        expect(body.hidden).toBe(false);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        expect(callbacks.onResize).toHaveBeenCalledTimes(2);

        toggle.click();
        expect(body.hidden).toBe(true);
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
    });

    it("hands the element id to onSelectIssue when a row is clicked", () => {
        const { panel, parent, callbacks } = makePanel();
        panel.update([issue({ elementId: "Task_7" })]);

        parent.querySelector<HTMLButtonElement>(".lint-problems__row")!.click();

        expect(callbacks.onSelectIssue).toHaveBeenCalledWith("Task_7");
    });

    it("flips overlay visibility through the eye button", () => {
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
