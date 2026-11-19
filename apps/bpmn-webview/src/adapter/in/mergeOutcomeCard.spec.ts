import { afterEach, describe, expect, it, vi } from "vitest";

import type { MergeOutcomeCardContent } from "../../domain/mergeCardContent";
import {
    createMergeOutcomeCardModule,
    MERGE_BLOCKER_MARKER,
    MergeOutcomeCard,
    type MergeOutcomeCardActions,
} from "./mergeOutcomeCard";

const APPLIED: MergeOutcomeCardContent = {
    applied: true,
    elementId: "Task_Remind",
    headline: "Kept from incoming: Send invoice",
    rows: [
        {
            label: "Pulled in:",
            links: [{ elementId: "Flow_1", name: "Flow from Order received to Send invoice" }],
        },
    ],
    reasons: [],
    blockers: [],
    announcement: [
        "Kept from incoming: Send invoice",
        "Pulled in: Flow from Order received to Send invoice",
    ],
    offer: { elementId: "Task_Remind", text: "Also keep the 2 flows current removed with it" },
};

const REFUSED: MergeOutcomeCardContent = {
    applied: false,
    elementId: "Task_Remind",
    headline: "Can't leave out Send invoice",
    rows: [],
    reasons: ["Your pick of Flow from Order received to Send invoice needs it"],
    moreReasons: "and 2 more",
    blockers: ["Flow_1", "Flow_Gone"],
    announcement: [
        "Can't leave out Send invoice",
        "Your pick of Flow from Order received to Send invoice needs it",
        "and 2 more",
    ],
};

// A task of 100 × 80 at (200, 100), with its label below and a boundary event on its bottom edge.
const TASK = {
    id: "Task_Remind",
    x: 200,
    y: 100,
    width: 100,
    height: 80,
    label: { x: 190, y: 190, width: 120, height: 20 },
    attachers: [{ id: "Timer_1", x: 260, y: 162, width: 36, height: 36 }],
};

const FLOW = {
    id: "Flow_1",
    waypoints: [
        { x: 100, y: 300 },
        { x: 300, y: 300 },
    ],
};

function build({
    drawn = { Task_Remind: TASK, Flow_1: FLOW } as Record<string, object>,
    paneHeight = 800,
    padOpenAt = undefined as string | undefined,
} = {}) {
    const overlays: { element: string; type: string; html: HTMLElement; position: object }[] = [];
    const markers = new Map<string, Set<string>>(Object.keys(drawn).map((id) => [id, new Set()]));
    const markedIds: string[] = [];
    const padOpen = { at: padOpenAt };
    // diagram-js resolves the id in its registry and throws on one it does not hold.
    const markersOf = (id: string) => {
        markedIds.push(id);
        const found = markers.get(id);
        if (found === undefined) throw new TypeError(`no element ${id}`);
        return found;
    };
    const listeners = new Map<string, (() => void)[]>();
    const container = document.createElement("div");
    const pad = document.createElement("div");
    pad.className = "djs-context-pad";
    pad.getBoundingClientRect = () => new DOMRect(0, 0, 30, 150);
    container.append(pad);
    const viewbox = { x: 0, y: 0, scale: 1, outer: { width: 1000, height: paneHeight } };
    const canvas = {
        addMarker: (id: string, marker: string) => markersOf(id).add(marker),
        removeMarker: (id: string, marker: string) => markersOf(id).delete(marker),
        viewbox: () => viewbox,
        getContainer: () => container,
        scroll: vi.fn(),
    };
    let card: MergeOutcomeCard | undefined;
    new MergeOutcomeCard(
        {
            add: (element, type, overlay) => {
                overlays.push({ element, type, ...overlay });
                return String(overlays.length);
            },
            remove: ({ type }) => {
                for (let index = overlays.length - 1; index >= 0; index -= 1) {
                    if (overlays[index].type === type) overlays.splice(index, 1);
                }
            },
        },
        canvas,
        { get: (id) => drawn[id] as never },
        {
            on: (event: string, listener: () => void) =>
                listeners.set(event, [...(listeners.get(event) ?? []), listener]),
        },
        { isOpen: (element) => (element as { id: string }).id === padOpen.at },
        { attach: (found) => (card = found) },
    );
    const actions: MergeOutcomeCardActions = {
        onSelect: vi.fn(),
        onKeepRemovedWith: vi.fn(),
        onChoose: vi.fn(),
        closeLabel: "Close",
    };
    const fire = (event: string) => {
        for (const listener of listeners.get(event) ?? []) listener();
    };
    return {
        card: card!,
        overlays,
        markers,
        markedIds,
        padOpen,
        actions,
        container,
        canvas,
        viewbox,
        fire,
    };
}

const buttonNamed = (root: HTMLElement, name: string) => {
    const found = [...root.querySelectorAll("button")].find(
        (button) => button.textContent === name || button.getAttribute("aria-label") === name,
    );
    if (!found) throw new Error(`no button ${name}`);
    return found;
};

const shownCard = (overlays: ReturnType<typeof build>["overlays"]) => overlays[0].html;

describe("MergeOutcomeCard", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("shows what a decision did at its element, with links to what it names and the offer", () => {
        const { card, overlays, actions } = build();

        expect(card.show(APPLIED, actions, { announce: true })).toBe(true);

        expect(overlays).toHaveLength(1);
        expect(overlays[0]).toMatchObject({ element: "Task_Remind", scale: false });
        const html = shownCard(overlays);
        expect(html.textContent).toContain("Kept from incoming: Send invoice");
        expect(html.textContent).toContain("Pulled in:");
        buttonNamed(html, "Flow from Order received to Send invoice").click();
        buttonNamed(html, "Also keep the 2 flows current removed with it").click();
        expect(actions.onSelect).toHaveBeenCalledWith("Flow_1");
        expect(actions.onKeepRemovedWith).toHaveBeenCalledWith("Task_Remind");
        expect(card.shownAt).toBe("Task_Remind");
    });

    it("offers a refused merge by hand's choices as buttons, the first one primary", () => {
        const { card, overlays, actions } = build();

        card.show(
            {
                ...REFUSED,
                headline: "The XML of Send invoice still holds conflict markers",
                reasons: ["Resolve each conflict and remove its markers, then save."],
                blockers: [],
                choices: [
                    { action: "editAgain", text: "Edit again", primary: true },
                    { action: "dismiss", text: "Keep incoming's version" },
                ],
            },
            actions,
            { announce: true },
        );
        const html = shownCard(overlays);
        buttonNamed(html, "Edit again").click();
        buttonNamed(html, "Keep incoming's version").click();

        expect(buttonNamed(html, "Edit again").className).toBe("merge-outcome-card__offer");
        expect(buttonNamed(html, "Keep incoming's version").className).toBe(
            "merge-outcome-card__choice",
        );
        expect(actions.onChoose).toHaveBeenNthCalledWith(1, "editAgain");
        expect(actions.onChoose).toHaveBeenNthCalledWith(2, "dismiss");
    });

    it("announces a notice as a status, neither taken nor refused", () => {
        const { card, overlays, actions, container } = build();

        card.show(
            {
                ...REFUSED,
                notice: true,
                headline: "Closed without saving: Send invoice is unchanged",
                reasons: [],
                blockers: [],
                announcement: ["Closed without saving: Send invoice is unchanged"],
            },
            actions,
            { announce: true },
        );

        expect(shownCard(overlays).className).toContain("merge-outcome-card--notice");
        expect(container.querySelector('[role="status"]')?.textContent).toContain(
            "Closed without saving",
        );
        expect(container.querySelector('[role="alert"]')?.textContent).toBe("");
    });

    it("announces an applied outcome as a status in a region that was there before", () => {
        const { card, actions, container } = build();
        const status = container.querySelector('[role="status"]');
        expect(status?.textContent).toBe("");

        card.show(APPLIED, actions, { announce: true });

        expect(container.querySelector('[role="status"]')).toBe(status);
        expect(status?.textContent).toContain("Kept from incoming: Send invoice");
        expect(status?.textContent).toContain(
            "Pulled in: Flow from Order received to Send invoice",
        );
        expect(container.querySelector('[role="alert"]')?.textContent).toBe("");
    });

    it("announces a refusal as an alert, and nothing when the card shows again", () => {
        const { card, actions, container } = build();
        const alert = container.querySelector('[role="alert"]')!;

        card.show(REFUSED, actions, { announce: true });
        const announced = alert.firstElementChild;
        card.show(REFUSED, actions, { announce: false });

        expect(alert.textContent).toContain("Can't leave out Send invoice");
        expect(alert.textContent).toContain("and 2 more");
        expect(alert.firstElementChild).toBe(announced);
    });

    it("says why a decision was refused and marks the blockers this canvas draws until it closes", () => {
        const { card, overlays, markers, markedIds, actions, container } = build();

        card.show(REFUSED, actions, { announce: true });

        const html = shownCard(overlays);
        expect(markedIds).not.toContain("Flow_Gone");
        expect(html.style.top).toBe("120px");
        expect(container.querySelector('[role="alert"]')?.textContent).toContain(
            "Can't leave out Send invoice",
        );
        expect(html.querySelectorAll("li")).toHaveLength(1);
        expect(html.textContent).toContain("and 2 more");
        expect(markers.get("Flow_1")?.has(MERGE_BLOCKER_MARKER)).toBe(true);

        buttonNamed(html, "Close").click();

        expect(overlays).toHaveLength(0);
        expect(markers.get("Flow_1")?.has(MERGE_BLOCKER_MARKER)).toBe(false);
        expect(card.shownAt).toBeUndefined();
    });

    it("marks the blockers again after the canvas repainted its marks", () => {
        const { card, markers, actions } = build();
        card.show(REFUSED, actions, { announce: true });
        markers.get("Flow_1")?.clear();

        card.remark();

        expect(markers.get("Flow_1")?.has(MERGE_BLOCKER_MARKER)).toBe(true);
    });

    it("links to the refused decision an undo freed", () => {
        const { card, overlays, actions } = build();

        card.show(
            {
                ...APPLIED,
                headline: "Took back the pick of Flow_1",
                unblocked: {
                    elementId: "Task_Check",
                    text: "Nothing blocks leaving out Check order now",
                },
            },
            actions,
            { announce: true },
        );

        buttonNamed(shownCard(overlays), "Nothing blocks leaving out Check order now").click();
        expect(actions.onSelect).toHaveBeenCalledWith("Task_Check");
    });

    it("goes below the element's label and boundary event, and below the pad open beside it", () => {
        const alone = build();
        alone.card.show(APPLIED, alone.actions, { announce: false });
        const withPad = build({ padOpenAt: "Task_Remind" });
        withPad.card.show(APPLIED, withPad.actions, { announce: false });

        // The label ends 110 below the task's top, the pad 150 below it.
        expect(shownCard(alone.overlays).style.top).toBe("120px");
        expect(shownCard(alone.overlays).style.left).toBe("0px");
        expect(shownCard(withPad.overlays).style.top).toBe("160px");
    });

    it("moves below the pad that opens after the card showed, as on a reselection", () => {
        const { card, overlays, actions, padOpen, fire } = build();
        card.show(APPLIED, actions, { announce: false });
        expect(shownCard(overlays).style.top).toBe("120px");

        padOpen.at = "Task_Remind";
        fire("contextPad.open");

        expect(shownCard(overlays).style.top).toBe("160px");
    });

    it("goes below a flow's middle", () => {
        const { card, overlays, actions } = build();

        card.show({ ...APPLIED, elementId: "Flow_1" }, actions, { announce: false });

        // Centred on 100, at most 280 wide while it is not measured.
        expect(shownCard(overlays).style.left).toBe("-40px");
        expect(shownCard(overlays).style.top).toBe("10px");
    });

    it("keeps its place below the element when the zoom changes", () => {
        const { card, overlays, actions, viewbox, fire } = build();
        card.show(APPLIED, actions, { announce: false });

        viewbox.scale = 2;
        fire("canvas.viewbox.changed");

        expect(shownCard(overlays).style.top).toBe("230px");
    });

    it("scrolls the diagram up where the card would pass the pane's bottom edge", () => {
        const { card, actions, canvas } = build({ paneHeight: 300 });
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
            new DOMRect(0, 0, 240, 100),
        );

        card.show(APPLIED, actions, { announce: false });

        // The card would end at 100 + 120 + 100, 20 past the pane, and keeps a margin of 16.
        expect(canvas.scroll).toHaveBeenCalledWith({ dx: 0, dy: -36 });
    });

    it("shows nothing for an element this canvas does not draw", () => {
        const { card, overlays, actions } = build({ drawn: { Flow_1: FLOW } });

        expect(card.show(APPLIED, actions, { announce: true })).toBe(false);
        expect(overlays).toHaveLength(0);
    });

    it("replaces the card it showed before", () => {
        const { card, overlays, actions } = build();

        card.show(REFUSED, actions, { announce: true });
        card.show(APPLIED, actions, { announce: true });

        expect(overlays).toHaveLength(1);
        expect(shownCard(overlays).textContent).toContain("Kept from incoming");
    });
});

describe("createMergeOutcomeCardModule", () => {
    it("hands the card to the pane that adds the module", () => {
        const module = createMergeOutcomeCardModule({ attach: () => undefined });

        expect(module.__init__).toStrictEqual(["mergeOutcomeCard"]);
        expect(module.mergeOutcomeCard).toStrictEqual(["type", MergeOutcomeCard]);
    });
});
