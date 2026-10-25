import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { click, pressKey, typeInto } from "../__fixtures__/dom";
import { template } from "../__fixtures__/templates";
import { fallbackTranslate } from "../types";
import type { ElementTemplate } from "../types";
import { ChooserOverlay } from "./ChooserOverlay";

const rest = template({
    id: "rest",
    name: "REST Connector",
    category: { id: "connectors", name: "Connectors" },
    properties: [
        { label: "URL", type: "String", binding: { type: "zeebe:input", name: "url" } },
        {
            type: "Hidden",
            value: "io.camunda:http-json:1",
            binding: { type: "zeebe:taskDefinition", property: "type" },
        },
    ],
});
const mail = template({
    id: "mail",
    name: "Send Mail",
    category: { id: "messaging", name: "Messaging" },
});
const audit = template({ id: "audit", name: "Audit Log" });

let container: HTMLElement;

beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
});

afterEach(() => {
    render(null, container);
    container.remove();
});

function renderOverlay(templates: ElementTemplate[] = [rest, mail, audit]) {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    act(() => {
        render(
            <ChooserOverlay
                templates={templates}
                translate={fallbackTranslate}
                onSelect={onSelect}
                onCancel={onCancel}
            />,
            container,
        );
    });
    const searchInput = container.querySelector<HTMLInputElement>(".etc-search-input")!;
    return { onSelect, onCancel, searchInput };
}

const cardNames = () =>
    [...container.querySelectorAll(".etc-card-name")].map((card) => card.textContent);
const cards = () => container.querySelectorAll(".etc-template-card");
const previewName = () => container.querySelector(".etc-preview-name")?.textContent ?? null;
const chip = (name: string) =>
    [...container.querySelectorAll(".etc-chip")].find((button) => button.textContent === name)!;

describe("ChooserOverlay", () => {
    it("lists the templates in authored order with the search focused", () => {
        const { searchInput } = renderOverlay();

        expect(cardNames()).toEqual(["REST Connector", "Send Mail", "Audit Log"]);
        expect(document.activeElement).toBe(searchInput);
    });

    it("shows the implementation and counts only non-Hidden properties on a card", () => {
        renderOverlay([rest]);

        expect(container.querySelector(".etc-card-impl")?.textContent).toBe(
            "Task Type:io.camunda:http-json:1",
        );
        expect(container.querySelector(".etc-badge--props")?.textContent).toBe("1 properties");
    });

    it("narrows the list to the search results and restores it when the search is cleared", () => {
        const { searchInput } = renderOverlay();

        typeInto(searchInput, "mail");
        expect(cardNames()).toEqual(["Send Mail"]);

        click(container.querySelector(".etc-search-clear"));
        expect(cardNames()).toEqual(["REST Connector", "Send Mail", "Audit Log"]);
        expect(document.activeElement).toBe(searchInput);
    });

    it("filters by category and clears the filter when the active chip is clicked again", () => {
        renderOverlay();

        click(chip("Messaging"));
        expect(cardNames()).toEqual(["Send Mail"]);

        click(chip("Messaging"));
        expect(cardNames()).toEqual(["REST Connector", "Send Mail", "Audit Log"]);

        click(chip("Connectors"));
        click(chip("All"));
        expect(cardNames()).toEqual(["REST Connector", "Send Mail", "Audit Log"]);
    });

    it("shows the empty state without a search hint when no template applies", () => {
        renderOverlay([]);

        expect(container.querySelector(".etc-empty-text")?.textContent).toBe("No templates found");
        expect(container.querySelector(".etc-empty-hint")).toBeNull();
    });

    it("hints at a different search term when a search finds nothing", () => {
        const { searchInput } = renderOverlay();

        typeInto(searchInput, "zzzz");

        expect(container.querySelector(".etc-empty-hint")?.textContent).toBe(
            "Try a different search term",
        );
    });

    it("previews a clicked template and applies it from the preview", () => {
        const { onSelect } = renderOverlay();

        click(cards()[1]);
        expect(previewName()).toBe("Send Mail");
        expect(cards()[1].classList).toContain("etc-template-card--selected");
        expect(onSelect).not.toHaveBeenCalled();

        click(container.querySelector(".etc-apply-btn"));
        expect(onSelect).toHaveBeenCalledWith(mail);
    });

    it("previews the visible parameters under their section", () => {
        renderOverlay([rest]);

        click(cards()[0]);

        const sections = [...container.querySelectorAll(".etc-param-section")].map((section) => ({
            title: section.querySelector(".etc-param-title")?.textContent,
            labels: [...section.querySelectorAll(".etc-param-label")].map(
                (label) => label.textContent,
            ),
        }));
        expect(sections).toEqual([{ title: "Input Parameters", labels: ["URL"] }]);
    });

    it("applies a template on double-click", () => {
        const { onSelect } = renderOverlay();

        click(cards()[2], "dblclick");

        expect(onSelect).toHaveBeenCalledWith(audit);
    });

    it("moves the selection with the arrow keys, clamped to both ends of the list", () => {
        const { searchInput } = renderOverlay();

        pressKey(searchInput, "ArrowDown");
        expect(previewName()).toBe("REST Connector");

        for (let i = 0; i < 4; i++) pressKey(searchInput, "ArrowDown");
        expect(previewName()).toBe("Audit Log");
        expect(cards()[2].classList).toContain("etc-template-card--focused");

        for (let i = 0; i < 4; i++) pressKey(searchInput, "ArrowUp");
        expect(previewName()).toBe("REST Connector");
    });

    it("applies the selected template on Enter and ignores Enter without a selection", () => {
        const { searchInput, onSelect } = renderOverlay();

        pressKey(searchInput, "Enter");
        expect(onSelect).not.toHaveBeenCalled();

        pressKey(searchInput, "ArrowDown");
        pressKey(searchInput, "Enter");
        expect(onSelect).toHaveBeenCalledWith(rest);
    });

    it("drops a selection the search filtered away and restarts keyboard navigation at the top", () => {
        const { searchInput } = renderOverlay();
        pressKey(searchInput, "ArrowDown");
        pressKey(searchInput, "ArrowDown");
        expect(previewName()).toBe("Send Mail");

        typeInto(searchInput, "audit");
        expect(previewName()).toBeNull();

        pressKey(searchInput, "ArrowDown");
        expect(previewName()).toBe("Audit Log");
    });

    it("cancels on Escape before the host's own Escape handling sees the key", () => {
        const hostEscapeHandler = vi.fn();
        document.body.addEventListener("keydown", hostEscapeHandler);
        const { searchInput, onCancel } = renderOverlay();

        pressKey(searchInput, "Escape");

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(hostEscapeHandler).not.toHaveBeenCalled();
        document.body.removeEventListener("keydown", hostEscapeHandler);
    });

    it("cancels on a backdrop click or the close button, but not on a click inside the modal", () => {
        const { onCancel } = renderOverlay();

        click(container.querySelector(".etc-modal"));
        expect(onCancel).not.toHaveBeenCalled();

        click(container.querySelector(".etc-backdrop"));
        click(container.querySelector(".etc-close-btn"));
        expect(onCancel).toHaveBeenCalledTimes(2);
    });
});
