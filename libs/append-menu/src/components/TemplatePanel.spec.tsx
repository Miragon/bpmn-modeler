import { fallbackTranslate } from "@miragon/bpmn-modeler-element-template-chooser/types";
import { render, type ComponentProps } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { click, hover } from "../__fixtures__/dom";
import { templateEntry } from "../__fixtures__/entries";
import { TemplatePanel } from "./TemplatePanel";

type PanelProps = ComponentProps<typeof TemplatePanel>;

let container: HTMLElement;
let scrollIntoView: Mock<Element["scrollIntoView"]>;

beforeEach(() => {
    scrollIntoView = vi.fn<Element["scrollIntoView"]>();
    Element.prototype.scrollIntoView = scrollIntoView;
    container = document.createElement("div");
    document.body.appendChild(container);
});

afterEach(() => {
    render(null, container);
    container.remove();
});

function renderPanel(overrides: Partial<PanelProps> = {}): PanelProps {
    const props: PanelProps = {
        entries: [
            templateEntry("invoice", "Invoice Worker"),
            templateEntry("notify", "Notify Customer"),
        ],
        categories: [
            { id: "billing", name: "Billing" },
            { id: "crm", name: "CRM" },
        ],
        translate: fallbackTranslate,
        search: "",
        activeCategory: null,
        selectedTemplateId: null,
        highlightedIndex: -1,
        previewIndex: -1,
        onCategoryChange: vi.fn(),
        onTemplateClick: vi.fn(),
        onCardHover: vi.fn(),
        onPreviewHover: vi.fn(),
        ...overrides,
    };
    act(() => {
        render(<TemplatePanel {...props} />, container);
    });
    return props;
}

const cards = () => container.querySelectorAll(".am-template-card");
const previewedTemplate = () => container.querySelector(".am-hover-card-name")?.textContent ?? null;
const chip = (name: string) =>
    [...container.querySelectorAll(".am-chip")].find((button) => button.textContent === name);
const hoverCardPlacement = () => {
    const style = container.querySelector<HTMLElement>(".am-hover-card")?.style;
    return style ? { left: style.left, top: style.top } : null;
};
const placeAt = (
    element: Element | null | undefined,
    rect: { left: number; top: number; right?: number },
) => vi.spyOn(element!, "getBoundingClientRect").mockReturnValue(rect as DOMRect);

describe("TemplatePanel", () => {
    it("previews only the template at the preview index", () => {
        const props = renderPanel();
        expect(previewedTemplate()).toBeNull();

        act(() => {
            render(<TemplatePanel {...props} previewIndex={1} />, container);
        });
        expect(previewedTemplate()).toBe("Notify Customer");
    });

    it("reports the mouse entering and leaving its cards and the preview", () => {
        const onCardHover = vi.fn();
        const onPreviewHover = vi.fn();
        renderPanel({ previewIndex: 0, onCardHover, onPreviewHover });

        hover(cards()[1], true);
        hover(cards()[1], false);
        hover(container.querySelector(".am-hover-card"), true);
        hover(container.querySelector(".am-hover-card"), false);

        expect(onCardHover.mock.calls).toEqual([
            [1, true],
            [1, false],
        ]);
        expect(onPreviewHover.mock.calls).toEqual([[true], [false]]);
    });

    it("marks and reveals the keyboard-highlighted template", () => {
        renderPanel({ highlightedIndex: 1 });

        expect(cards()[1].classList).toContain("am-template-card--focused");
        expect(scrollIntoView.mock.contexts).toContain(cards()[1]);
    });

    it("keeps the preview beside its card when the list scrolls", () => {
        const props = renderPanel();
        placeAt(container.querySelector(".am-template-panel"), { left: 600, top: 0 });
        const card = placeAt(cards()[1], { left: 600, top: 240 });

        act(() => {
            render(<TemplatePanel {...props} previewIndex={1} />, container);
        });
        expect(hoverCardPlacement()).toEqual({ left: "292px", top: "240px" });

        card.mockReturnValue({ left: 600, top: 180 } as DOMRect);
        act(() => {
            container.querySelector(".am-template-list")!.dispatchEvent(new Event("scroll"));
        });
        expect(hoverCardPlacement()).toEqual({ left: "292px", top: "180px" });
    });

    it("keeps the preview beside the panel when the overlay moves it", () => {
        const props = renderPanel({ previewIndex: 1 });
        const panel = placeAt(container.querySelector(".am-template-panel"), { left: 600, top: 0 });
        placeAt(cards()[1], { left: 600, top: 240 });

        panel.mockReturnValue({ left: 500, top: 0 } as DOMRect);
        act(() => {
            render(<TemplatePanel {...props} />, container);
        });

        expect(hoverCardPlacement()).toEqual({ left: "192px", top: "240px" });
    });

    it("keeps the preview left of a panel against the left edge, within the mouse's reach", () => {
        const props = renderPanel();
        placeAt(container.querySelector(".am-template-panel"), { left: 150, right: 690, top: 0 });
        placeAt(cards()[1], { left: 150, top: 240 });

        act(() => {
            render(<TemplatePanel {...props} previewIndex={1} />, container);
        });

        expect(hoverCardPlacement()).toEqual({ left: "8px", top: "240px" });
    });

    it("toggles the category filter from its chips", () => {
        const onCategoryChange = vi.fn();
        renderPanel({ activeCategory: "crm", onCategoryChange });

        click(chip("Billing"));
        click(chip("CRM"));
        click(chip("All"));

        expect(onCategoryChange.mock.calls).toEqual([["billing"], [null], [null]]);
    });

    it.each([
        ["without a search", "", false],
        ["while searching", "zzz", true],
    ])("shows the empty state %s", (_case, search, showsHint) => {
        renderPanel({ entries: [], search });

        expect(container.querySelector(".am-empty-text")?.textContent).toBe("No templates found");
        expect(container.querySelector(".am-empty-hint") !== null).toBe(showsHint);
    });
});
