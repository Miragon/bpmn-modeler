import { render, type ComponentProps } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hover } from "../__fixtures__/dom";
import { group } from "../__fixtures__/entries";
import { flattenPaletteItems, processPaletteGroups } from "../filtering";
import type { BpmnElementGroup } from "../types";
import { BpmnElementPalette } from "./BpmnElementPalette";

const tasks = group("tasks", "Tasks", [
    ["append-user-task", "User task"],
    ["append-service-task", "Service task", { disabled: true }],
]);
const gateways = group("gateways", "Gateways", [["append-exclusive-gateway", "Exclusive gateway"]]);
const other = group("other", "Other", [["custom-entry", "Custom"]]);
const described = group("subprocess", "Sub-processes", [
    [
        "append-call-activity",
        "Call activity",
        { description: "Calls another process as a reusable subprocess" },
    ],
    ["append-transaction", "Transaction"],
]);

let container: HTMLElement;
let menu: HTMLElement;

beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    container = document.createElement("div");
    menu = document.createElement("div");
    document.body.append(container, menu);
});

afterEach(() => {
    render(null, container);
    container.remove();
    menu.remove();
});

function renderPalette(
    groups: BpmnElementGroup[],
    options: {
        favourites?: string[];
        search?: string;
        appliesTo?: string[];
        previewKey?: string;
    } = {},
    overrides: Partial<ComponentProps<typeof BpmnElementPalette>> = {},
) {
    const processed = processPaletteGroups(
        groups,
        options.favourites ?? [],
        options.search ?? "",
        options.appliesTo ? new Set(options.appliesTo) : null,
    );
    const previewedItem =
        flattenPaletteItems(processed).find((item) => item.key === options.previewKey) ?? null;
    act(() => {
        render(
            <BpmnElementPalette
                favouriteEntries={processed.favouriteEntries}
                groups={processed.groups}
                translate={(text) => `translated:${text}`}
                expanded
                highlightedKey={null}
                previewedItem={previewedItem}
                previewAnchorRef={{ current: menu }}
                onToggleExpand={vi.fn()}
                onEntryHover={vi.fn()}
                onPreviewHover={vi.fn()}
                onSelect={vi.fn()}
                {...overrides}
            />,
            container,
        );
    });
    return processed;
}

const button = (navKey: string) =>
    container.querySelectorAll<HTMLButtonElement>(`[data-nav-key="${navKey}"]`);
const previewCard = () => container.querySelector<HTMLElement>(".am-hover-card");
const describedButtons = () =>
    [...container.querySelectorAll("[aria-describedby]")].map((element) =>
        element.getAttribute("data-nav-key"),
    );
const placeAt = (
    element: Element | undefined,
    rect: { left: number; top: number; right?: number },
) => vi.spyOn(element!, "getBoundingClientRect").mockReturnValue(rect as DOMRect);

describe("BpmnElementPalette", () => {
    it("renders exactly one button per navigable item, keyed like the keyboard order", () => {
        const processed = renderPalette([tasks, gateways], {
            favourites: ["bpmn:ExclusiveGateway"],
        });

        const navigable = flattenPaletteItems(processed).filter((item) => !item.hidden);
        expect(navigable.length).toBeGreaterThan(0);
        for (const item of navigable) {
            expect(button(item.key)).toHaveLength(1);
            expect(button(item.key)[0].disabled).toBe(item.disabled);
        }
        expect(container.querySelectorAll(".am-bpmn-button")).toHaveLength(navigable.length);
    });

    it("marks the highlighted button", () => {
        renderPalette([tasks], {}, { highlightedKey: "grp:tasks:append-user-task" });

        expect(button("grp:tasks:append-user-task")[0].classList).toContain(
            "am-bpmn-button--focused",
        );
    });

    it("omits a group whose entries are all filtered out", () => {
        renderPalette([tasks, gateways], { search: "gateway" });

        const titles = [...container.querySelectorAll(".am-bpmn-group-title")].map(
            (title) => title.textContent,
        );
        expect(titles).toEqual(["Gateways"]);
    });

    it("translates only the synthesized Other group title", () => {
        renderPalette([gateways, other]);

        const titles = [...container.querySelectorAll(".am-bpmn-group-title")].map(
            (title) => title.textContent,
        );
        expect(titles).toEqual(["Gateways", "translated:Other"]);
    });

    it("previews the item's description in a card that describes its button", () => {
        renderPalette([described], { previewKey: "grp:subprocess:append-call-activity" });

        const card = previewCard();
        expect(card?.getAttribute("role")).toBe("tooltip");
        expect(card?.querySelector(".am-hover-card-name")?.textContent).toBe("Call activity");
        expect(card?.querySelector(".am-hover-card-desc")?.textContent).toBe(
            "Calls another process as a reusable subprocess",
        );
        expect(
            button("grp:subprocess:append-call-activity")[0].getAttribute("aria-describedby"),
        ).toBe(card?.id);
        expect(describedButtons()).toEqual(["grp:subprocess:append-call-activity"]);
    });

    it("previews only the favourite instance in the collapsed palette", () => {
        renderPalette(
            [described],
            { favourites: ["bpmn:CallActivity"], previewKey: "fav:append-call-activity" },
            { expanded: false },
        );

        expect(previewCard()?.textContent).toContain("Calls another process");
        expect(describedButtons()).toEqual(["fav:append-call-activity"]);
    });

    it("shows no card for an entry without a description", () => {
        renderPalette([described], { previewKey: "grp:subprocess:append-transaction" });

        expect(previewCard()).toBeNull();
        expect(describedButtons()).toEqual([]);
    });

    it("reports the mouse entering and leaving its entries and the card", () => {
        const onEntryHover = vi.fn();
        const onPreviewHover = vi.fn();
        renderPalette(
            [described],
            { previewKey: "grp:subprocess:append-call-activity" },
            { onEntryHover, onPreviewHover },
        );

        hover(button("grp:subprocess:append-transaction")[0], true);
        hover(button("grp:subprocess:append-transaction")[0], false);
        hover(previewCard(), true);
        hover(previewCard(), false);

        expect(onEntryHover.mock.calls).toEqual([
            ["grp:subprocess:append-transaction", true],
            ["grp:subprocess:append-transaction", false],
        ]);
        expect(onPreviewHover.mock.calls).toEqual([[true], [false]]);
    });

    it("opens the card beside the menu, level with the button, and follows the scroll", () => {
        placeAt(menu, { left: 600, top: 0 });
        const previewKey = "grp:subprocess:append-call-activity";
        renderPalette([described]);
        const callActivity = placeAt(button(previewKey)[0], { left: 900, top: 240 });

        renderPalette([described], { previewKey });
        expect(previewCard()?.style.left).toBe("292px");
        expect(previewCard()?.style.top).toBe("240px");

        callActivity.mockReturnValue({ left: 900, top: 180 } as DOMRect);
        act(() => {
            container.querySelector(".am-palette-content")!.dispatchEvent(new Event("scroll"));
        });
        expect(previewCard()?.style.top).toBe("180px");
    });

    it("opens the card right of a menu too close to the left edge to fit it", () => {
        placeAt(menu, { left: 150, right: 470, top: 0 });
        const previewKey = "grp:subprocess:append-call-activity";
        renderPalette([described]);
        placeAt(button(previewKey)[0], { left: 160, top: 240 });

        renderPalette([described], { previewKey });

        expect(previewCard()?.style.left).toBe("478px");
    });
});
