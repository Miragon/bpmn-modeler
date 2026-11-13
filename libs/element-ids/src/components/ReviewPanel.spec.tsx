import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ElementIdProposal } from "../ElementIdsService";
import { fallbackTranslate } from "../translate";
import { ReviewPanel, type ReviewPanelProps } from "./ReviewPanel";

const proposal = (
    id: string,
    name: string,
    kind: ElementIdProposal["candidate"]["kind"],
    status: ElementIdProposal["status"],
    newId?: string,
    clash = false,
): ElementIdProposal => ({
    candidate: {
        id,
        name,
        type: "bpmn:Task",
        element: { $type: "bpmn:Task", id, name },
        kind,
        target: { kind: "element", element: { id, type: "bpmn:Task" } },
        shown: { id, type: "bpmn:Task" },
    },
    status,
    newId,
    clash,
});

/** A stand-in for the service: unchecked IDs come back unchecked. */
function propose(unchecked: ReadonlySet<string>): ElementIdProposal[] {
    const spell = (name: string) => `task_${name.toLowerCase()}`;
    const rows = [
        ["Activity_1", "Check", "activity"],
        ["Activity_2", "Ship", "activity"],
        ["Flow_1", "Yes", "flow"],
    ] as const;
    return [
        ...rows.map(([id, name, kind]) =>
            proposal(
                id,
                name,
                kind,
                unchecked.has(id) ? "unchecked" : "rename",
                spell(name),
                name === "Ship",
            ),
        ),
        proposal("task_done", "Done", "activity", "matches", "task_done"),
        proposal("Flow_2", "", "flow", "skipped"),
    ];
}

let container: HTMLElement;
let props: ReviewPanelProps;

function mount(overrides: Partial<ReviewPanelProps> = {}) {
    props = {
        initialUnchecked: new Set(),
        revision: 0,
        propose,
        onApply: vi.fn(),
        onClose: vi.fn(),
        onReveal: vi.fn(),
        translate: fallbackTranslate,
        ...overrides,
    };
    act(() => {
        render(<ReviewPanel {...props} />, container);
    });
}

const $ = <T extends Element = HTMLElement>(selector: string) =>
    container.querySelector<T>(selector)!;
const $$ = (selector: string) => [...container.querySelectorAll<HTMLElement>(selector)];
const text = (selector: string) => $$(selector).map((element) => element.textContent?.trim());
const act$ = (run: () => void) => act(run);
const toggle = (checkbox: HTMLInputElement) =>
    act$(() => {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    });

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
});

afterEach(() => {
    render(null, container);
    container.remove();
});

describe("ReviewPanel", () => {
    it("groups the IDs that change by kind and says how many will change", () => {
        mount();

        expect(text(".eid-group:not(.eid-group-quiet) .eid-group-label")).toEqual([
            "Activities",
            "Flows",
        ]);
        expect(text(".eid-summary")).toEqual(["3 of 3 IDs will change"]);
        expect(text(".eid-row:not(.eid-plain) .eid-old")).toEqual([
            "Activity_1",
            "Activity_2",
            "Flow_1",
        ]);
        expect(text(".eid-row:not(.eid-plain) .eid-new")).toEqual([
            "task_check",
            "task_ship",
            "task_yes",
        ]);
    });

    it("starts with the rows it is handed unchecked", () => {
        mount({ initialUnchecked: new Set(["Activity_2"]) });

        expect($<HTMLInputElement>('input[aria-label="Rename Ship"]').checked).toBe(false);
        expect(text(".eid-summary")).toEqual(["2 of 3 IDs will change"]);
    });

    it("marks a counter added for a name clash", () => {
        mount();

        expect(text(".eid-tag")).toEqual(["same name as another element"]);
    });

    it("keeps IDs that already match and elements without a name in collapsed groups", () => {
        mount();

        expect(text(".eid-group-quiet .eid-group-label")).toEqual([
            "Already match",
            "No name, skipped",
        ]);
        expect($$(".eid-plain")).toHaveLength(0);

        act$(() => $$(".eid-group-quiet .eid-twistie").forEach((twistie) => twistie.click()));

        expect(text(".eid-plain .eid-name")).toEqual(["Done", "No name"]);
    });

    it("unchecks a row, counts it out and hands the unchecked IDs to Apply", () => {
        mount();

        toggle(
            $$("input.eid-check").find(
                (box) => box.getAttribute("aria-label") === "Rename Ship",
            ) as HTMLInputElement,
        );

        expect(text(".eid-summary")).toEqual(["2 of 3 IDs will change"]);
        expect($$(".eid-off .eid-name").map((n) => n.textContent)).toEqual(["Ship"]);

        act$(() => $(".eid-primary").click());

        expect(props.onApply).toHaveBeenCalledWith(new Set(["Activity_2"]));
    });

    it("unchecks a whole group from its checkbox and shows a partly checked group as mixed", () => {
        mount();
        const activities = $<HTMLInputElement>('input[aria-label="Rename all Activities"]');

        toggle(
            $$("input.eid-check").find(
                (box) => box.getAttribute("aria-label") === "Rename Ship",
            ) as HTMLInputElement,
        );
        expect(activities.indeterminate).toBe(true);

        toggle(activities);
        toggle(activities);

        expect(activities.checked).toBe(false);
        expect(text(".eid-summary")).toEqual(["1 of 3 IDs will change"]);
    });

    it("disables Apply when nothing would change", () => {
        mount();

        toggle($<HTMLInputElement>('input[aria-label="Rename all Activities"]'));
        toggle($<HTMLInputElement>('input[aria-label="Rename all Flows"]'));

        expect($<HTMLButtonElement>(".eid-primary").disabled).toBe(true);
    });

    it("reveals the element of a row that is clicked", () => {
        mount();

        act$(() => $$(".eid-row-main")[1]!.click());

        expect((props.onReveal as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].candidate.id).toBe(
            "Activity_2",
        );
    });

    it("closes on Discard, on the close button and on Escape, before the canvas sees the key", () => {
        const canvasKeys = vi.fn();
        document.addEventListener("keydown", canvasKeys);
        mount();

        act$(() => $$(".eid-btn")[1]!.click());
        act$(() => $(".eid-icon-btn").click());
        act$(() =>
            $(".eid-row-main").dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            ),
        );

        expect(props.onClose).toHaveBeenCalledTimes(3);
        expect(canvasKeys).not.toHaveBeenCalled();
        document.removeEventListener("keydown", canvasKeys);
    });

    it("puts the focus on Apply when it opens", () => {
        mount();

        expect(document.activeElement).toBe($(".eid-primary"));
    });

    it.each([
        [
            [proposal("task_done", "Done", "activity", "matches", "task_done")],
            "Every ID already follows its name.",
        ],
        [[proposal("Flow_2", "", "flow", "skipped")], "No element has a name yet."],
    ])("explains why there is nothing to rename", (proposals, message) => {
        mount({ propose: () => proposals });

        expect(text(".eid-empty")).toEqual([message]);
        expect(text(".eid-summary")).toEqual(["0 of 0 IDs will change"]);
    });

    it("asks again when the diagram changes under the same choices", () => {
        const spy = vi.fn(propose);
        mount({ propose: spy });

        act$(() => {
            render(<ReviewPanel {...props} propose={spy} revision={1} />, container);
        });

        expect(spy).toHaveBeenCalledTimes(2);
    });
});
