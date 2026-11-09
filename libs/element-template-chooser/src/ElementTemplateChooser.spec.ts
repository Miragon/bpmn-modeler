import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { click, pressKey } from "./__fixtures__/dom";
import { template } from "./__fixtures__/templates";
import { ElementTemplateChooser } from "./ElementTemplateChooser";
import type { ElementTemplate } from "./types";

const appliedTemplate = template({ id: "applied", name: "Applied Template" });
const otherTemplate = template({
    id: "other",
    name: "Other Template",
    properties: [
        { type: "String", binding: { type: "zeebe:input", name: "url" } },
        { type: "String", binding: { type: "zeebe:input", name: "method" } },
    ],
});

const element = {
    id: "Task_1",
    businessObject: {
        get: (key: string) => (key === "modelerTemplate" ? appliedTemplate.id : undefined),
    },
};

type SelectListener = (event: { element: unknown }) => void;

let themedHost: HTMLElement;

beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
    themedHost.querySelectorAll(".etc-overlay-root").forEach((root) => render(null, root));
    themedHost.remove();
    vi.restoreAllMocks();
});

function createChooser(
    config: { elementTemplateChooser?: boolean } | null = null,
    services: Record<string, unknown> = {},
) {
    const listeners = new Map<string, SelectListener>();
    const eventBus = {
        on: vi.fn((event: string, listener: SelectListener) => listeners.set(event, listener)),
    };
    const elementTemplates = {
        getLatest: vi.fn((): ElementTemplate[] => [appliedTemplate, otherTemplate]),
        applyTemplate: vi.fn(),
    };

    themedHost = document.createElement("div");
    themedHost.setAttribute("data-bpmn-theme", "dark");
    const canvasParent = document.createElement("div");
    const canvasContainer = document.createElement("div");
    canvasParent.appendChild(canvasContainer);
    themedHost.appendChild(canvasParent);
    document.body.appendChild(themedHost);

    new ElementTemplateChooser(
        config,
        eventBus as never,
        elementTemplates as never,
        { getContainer: () => canvasContainer } as never,
        { get: <T>(name: string) => (services[name] ?? null) as T | null },
    );

    const requestTemplateSelection = () =>
        act(() => listeners.get("elementTemplates.select")?.({ element }));
    const overlayRoot = () => canvasParent.querySelector<HTMLElement>(":scope > .etc-overlay-root");

    return { eventBus, elementTemplates, requestTemplateSelection, overlayRoot };
}

const settlePromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("ElementTemplateChooser", () => {
    it("leaves template selection to the properties panel when disabled by config", () => {
        const { eventBus } = createChooser({ elementTemplateChooser: false });

        expect(eventBus.on).not.toHaveBeenCalled();
    });

    it("opens next to the canvas in the instance theme, offering only templates not yet applied", () => {
        const { elementTemplates, requestTemplateSelection, overlayRoot } = createChooser();

        requestTemplateSelection();

        expect(elementTemplates.getLatest).toHaveBeenCalledWith(element);
        expect(overlayRoot()?.getAttribute("data-bpmn-theme")).toBe("dark");
        const offered = [...overlayRoot()!.querySelectorAll(".etc-card-name")];
        expect(offered.map((card) => card.textContent)).toEqual(["Other Template"]);
    });

    it("lists only the templates the offer service offers", () => {
        const thirdTemplate = template({ id: "third", name: "Third Template" });
        const offer = { isOffered: (offered: ElementTemplate) => offered.id !== "other" };
        const { elementTemplates, requestTemplateSelection, overlayRoot } = createChooser(null, {
            elementTemplateOffer: offer,
        });
        elementTemplates.getLatest.mockReturnValue([appliedTemplate, otherTemplate, thirdTemplate]);

        requestTemplateSelection();

        const offered = [...overlayRoot()!.querySelectorAll(".etc-card-name")];
        expect(offered.map((card) => card.textContent)).toEqual(["Third Template"]);
    });

    it("resolves placeholders without a translate service", () => {
        const { requestTemplateSelection, overlayRoot } = createChooser();

        requestTemplateSelection();

        expect(overlayRoot()?.querySelector(".etc-badge--props")?.textContent).toBe("2 properties");
    });

    it("applies the confirmed template and closes the chooser", async () => {
        const { elementTemplates, requestTemplateSelection, overlayRoot } = createChooser();
        requestTemplateSelection();

        click(overlayRoot()!.querySelector(".etc-template-card"));
        click(overlayRoot()!.querySelector(".etc-apply-btn"));
        await settlePromises();

        expect(elementTemplates.applyTemplate).toHaveBeenCalledWith(element, otherTemplate);
        expect(overlayRoot()).toBeNull();
    });

    it("closes on cancel without applying or reporting an error", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const { elementTemplates, requestTemplateSelection, overlayRoot } = createChooser();
        requestTemplateSelection();

        pressKey(document, "Escape");
        await settlePromises();

        expect(overlayRoot()).toBeNull();
        expect(elementTemplates.applyTemplate).not.toHaveBeenCalled();
        expect(consoleError).not.toHaveBeenCalled();
    });

    it("reports a template that fails to apply", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const failure = new Error("incompatible element");
        const { elementTemplates, requestTemplateSelection, overlayRoot } = createChooser();
        elementTemplates.applyTemplate.mockImplementation(() => {
            throw failure;
        });
        requestTemplateSelection();

        click(overlayRoot()!.querySelector(".etc-template-card"), "dblclick");
        await settlePromises();

        expect(consoleError).toHaveBeenCalledWith("elementTemplate.select :: error", failure);
    });
});
