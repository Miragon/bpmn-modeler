import { describe, expect, it, vi } from "vitest";

import type { MergeOutcomeCardContent } from "../../domain/mergeOutcomeCard";
import {
    createMergeOutcomeCardModule,
    MERGE_BLOCKER_MARKER,
    MergeOutcomeCard,
    type MergeOutcomeCardActions,
} from "./mergeOutcomeCard";

const APPLIED: MergeOutcomeCardContent = {
    applied: true,
    elementId: "Task_Remind",
    headline: "Kept from incoming: Send reminder email",
    rows: [{ label: "Pulled in:", elementIds: ["Flow_1"] }],
    reasons: [],
    blockers: [],
    offer: { elementId: "Task_Remind", text: "Also keep the 2 flows current removed with it" },
};

const REFUSED: MergeOutcomeCardContent = {
    applied: false,
    elementId: "Task_Remind",
    headline: "Cannot leave out Send reminder email",
    rows: [],
    reasons: ["Flow_1, which you picked, needs Send reminder email"],
    moreReasons: "and 2 more",
    blockers: ["Flow_1", "Flow_Gone"],
};

/** A pane of 1000 × 800 px at 100 %, its canvas's top left corner at the diagram's origin. */
const PANE = document.createElement("div");
PANE.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 800);

function build(
    drawn: readonly string[] = ["Task_Remind", "Flow_1"],
    elements: Record<string, object> = {},
) {
    const overlays: { element: string; type: string; html: HTMLElement; position: object }[] = [];
    const markers = new Map<string, Set<string>>(drawn.map((id) => [id, new Set()]));
    const overlayService = {
        add: (element: string, type: string, overlay: { html: HTMLElement; position: object }) => {
            overlays.push({ element, type, ...overlay });
            return String(overlays.length);
        },
        remove: ({ type }: { type: string }) => {
            for (let index = overlays.length - 1; index >= 0; index -= 1) {
                if (overlays[index].type === type) overlays.splice(index, 1);
            }
        },
    };
    const canvas = {
        addMarker: (id: string, marker: string) => markers.get(id)?.add(marker),
        removeMarker: (id: string, marker: string) => markers.get(id)?.delete(marker),
        viewbox: () => ({ x: 0, y: 0, scale: 1 }),
        getContainer: () => PANE,
    };
    const registry = {
        get: (id: string) => (markers.has(id) ? (elements[id] ?? { id }) : undefined),
        getAll: () => Object.values(elements),
    };
    let card: MergeOutcomeCard | undefined;
    new MergeOutcomeCard(overlayService, canvas, registry, { attach: (found) => (card = found) });
    const actions: MergeOutcomeCardActions = {
        onSelect: vi.fn(),
        onKeepRemovedFlows: vi.fn(),
        nameOf: (id) => (id === "Flow_1" ? "Flow from 7 days to Send reminder email" : id),
        closeLabel: "Close",
    };
    return { card: card!, overlays, markers, actions };
}

const buttonNamed = (root: HTMLElement, name: string) =>
    [...root.querySelectorAll("button")].find(
        (button) => button.textContent === name || button.getAttribute("aria-label") === name,
    );

describe("MergeOutcomeCard", () => {
    it("shows what a decision did below its element, with links to what it names and the offer", () => {
        const { card, overlays, actions } = build();

        expect(card.show(APPLIED, actions)).toBe(true);

        expect(overlays).toHaveLength(1);
        const [{ element, html }] = overlays;
        expect(element).toBe("Task_Remind");
        expect(html.getAttribute("role")).toBe("status");
        expect(html.textContent).toContain("Kept from incoming: Send reminder email");
        buttonNamed(html, "Flow from 7 days to Send reminder email")?.click();
        buttonNamed(html, "Also keep the 2 flows current removed with it")?.click();
        expect(actions.onSelect).toHaveBeenCalledWith("Flow_1");
        expect(actions.onKeepRemovedFlows).toHaveBeenCalledWith("Task_Remind");
        expect(card.shownAt).toBe("Task_Remind");
    });

    it("says why a decision was refused and marks the blockers this canvas draws until it closes", () => {
        const { card, overlays, markers, actions } = build();

        card.show(REFUSED, actions);

        const [{ html }] = overlays;
        expect(html.getAttribute("role")).toBe("alert");
        expect(html.querySelectorAll("li")).toHaveLength(1);
        expect(html.textContent).toContain("and 2 more");
        expect(markers.get("Flow_1")?.has(MERGE_BLOCKER_MARKER)).toBe(true);

        buttonNamed(html, "Close")?.click();

        expect(overlays).toHaveLength(0);
        expect(markers.get("Flow_1")?.has(MERGE_BLOCKER_MARKER)).toBe(false);
        expect(card.shownAt).toBeUndefined();
    });

    it("goes below the element where it covers none of the element's neighbours", () => {
        const timer = { id: "Timer_7Days", x: 20, y: 200, width: 36, height: 36 };
        const flow = {
            id: "Flow_1",
            waypoints: [
                { x: 38, y: 200 },
                { x: 100, y: 140 },
            ],
            source: timer,
        };
        const task = {
            id: "Task_Remind",
            x: 100,
            y: 100,
            width: 100,
            height: 80,
            incoming: [flow],
        };
        Object.assign(flow, { target: task });
        const { card, overlays, actions } = build(["Task_Remind", "Flow_1", "Timer_7Days"], {
            Task_Remind: task,
            Flow_1: flow,
            Timer_7Days: timer,
        });
        const measured = vi
            .spyOn(HTMLElement.prototype, "getBoundingClientRect")
            .mockReturnValue(new DOMRect(0, 0, 200, 100));

        card.show(APPLIED, actions);

        measured.mockRestore();
        // Ending at the task's right edge, the card would cover the timer the flow starts from.
        const [{ html, position }] = overlays;
        expect(position).toStrictEqual({ left: 0, top: 92 });
        expect(html.dataset.side).toBe("below");
    });

    it("shows nothing for an element this canvas does not draw", () => {
        const { card, overlays, actions } = build(["Flow_1"]);

        expect(card.show(APPLIED, actions)).toBe(false);
        expect(overlays).toHaveLength(0);
    });

    it("replaces the card it showed before", () => {
        const { card, overlays, actions } = build();

        card.show(REFUSED, actions);
        card.show(APPLIED, actions);

        expect(overlays).toHaveLength(1);
        expect(overlays[0].html.textContent).toContain("Kept from incoming");
    });
});

describe("createMergeOutcomeCardModule", () => {
    it("hands the card to the pane that adds the module", () => {
        const module = createMergeOutcomeCardModule({ attach: () => undefined });

        expect(module.__init__).toStrictEqual(["mergeOutcomeCard"]);
        expect(module.mergeOutcomeCard).toStrictEqual(["type", MergeOutcomeCard]);
    });
});
