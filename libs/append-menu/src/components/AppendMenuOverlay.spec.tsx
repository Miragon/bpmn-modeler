import { fallbackTranslate } from "@miragon/bpmn-modeler-element-template-chooser/types";
import { render, type ComponentProps } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { click, hover, pressKey, typeInto } from "../__fixtures__/dom";
import { group, templateEntry } from "../__fixtures__/entries";
import { AppendMenuOverlay } from "./AppendMenuOverlay";

const tasks = group("tasks", "Tasks", [
    ["append-user-task", "User task"],
    ["append-service-task", "Service task"],
    ["append-send-task", "Send task"],
]);
const gateways = group("gateways", "Gateways", [["append-exclusive-gateway", "Exclusive gateway"]]);
const [userTask] = tasks.entries;
const [exclusiveGateway] = gateways.entries;
const describedTasks = group("tasks", "Tasks", [
    ["append-user-task", "User task", { description: "Work that needs to be done by a person" }],
    [
        "append-service-task",
        "Service task",
        { description: "Automated work carried out by a job worker or connector" },
    ],
    ["append-send-task", "Send task", { description: "Publishes a message to a receiver" }],
    ["append-manual-task", "Manual task"],
]);
const subProcesses = group("subprocess", "Sub-processes", [
    [
        "append-call-activity",
        "Call activity",
        { description: "Calls another process as a reusable subprocess", search: "child process" },
    ],
]);

const HOVER_HIDE_DELAY = 150;

const invoiceWorker = templateEntry("invoice", "Invoice Worker", {
    appliesTo: ["bpmn:ServiceTask"],
});
const notifyCustomer = templateEntry("notify", "Notify Customer", {
    appliesTo: ["bpmn:ServiceTask", "bpmn:SendTask"],
    presetId: "email",
});

type OverlayProps = ComponentProps<typeof AppendMenuOverlay>;

let container: HTMLElement;

beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
});

afterEach(() => {
    render(null, container);
    container.remove();
    vi.useRealTimers();
});

function renderOverlay(overrides: Partial<OverlayProps> = {}) {
    const props: OverlayProps = {
        templateEntries: [invoiceWorker, notifyCustomer],
        bpmnGroups: [tasks, gateways],
        favourites: [],
        translate: fallbackTranslate,
        position: { x: 120, y: 80 },
        canvasBounds: { left: 0, top: 0, right: 1000, bottom: 800 },
        onSelect: vi.fn(),
        onTemplateTypeSelect: vi.fn(),
        onCancel: vi.fn(),
        ...overrides,
    };
    act(() => {
        render(<AppendMenuOverlay {...props} />, container);
    });
    const searchInput = container.querySelector<HTMLInputElement>(".am-search-input")!;
    return { ...props, searchInput };
}

const templateCard = (label: string) =>
    [...container.querySelectorAll(".am-template-card")].find(
        (card) => card.querySelector(".am-card-name")?.textContent === label,
    );
const highlightedTemplate = () =>
    container.querySelector(".am-template-card--focused .am-card-name")?.textContent ?? null;
const highlightedPaletteKey = () =>
    container.querySelector(".am-bpmn-button--focused")?.getAttribute("data-nav-key") ?? null;
const paletteKeys = () =>
    [...container.querySelectorAll(".am-bpmn-button")].map((button) =>
        button.getAttribute("data-nav-key"),
    );
const palettePanel = () => container.querySelector(".am-palette-panel")!;
const isPaletteExpanded = () => palettePanel().classList.contains("am-palette-panel--expanded");
const paletteButton = (navKey: string) => container.querySelector(`[data-nav-key="${navKey}"]`);
const previews = () =>
    [...container.querySelectorAll(".am-hover-card .am-hover-card-name")].map(
        (name) => name.textContent,
    );
const elapse = (milliseconds: number) =>
    act(() => {
        vi.advanceTimersByTime(milliseconds);
    });

describe("AppendMenuOverlay", () => {
    it("focuses the search and highlights the first template so Enter appends it", () => {
        const { searchInput, onSelect } = renderOverlay();

        expect(document.activeElement).toBe(searchInput);
        expect(highlightedTemplate()).toBe("Invoice Worker");

        pressKey(searchInput, "Enter");
        expect(onSelect).toHaveBeenCalledWith(
            invoiceWorker.entry.action,
            expect.any(KeyboardEvent),
        );
    });

    it("moves the highlight with the arrow keys and expands the palette when crossing over", () => {
        const { searchInput, onSelect } = renderOverlay();

        pressKey(searchInput, "ArrowDown");
        expect(highlightedTemplate()).toBe("Notify Customer");

        pressKey(searchInput, "ArrowRight");
        expect(highlightedTemplate()).toBeNull();
        expect(highlightedPaletteKey()).toBe("grp:tasks:append-service-task");
        expect(isPaletteExpanded()).toBe(true);

        pressKey(searchInput, "ArrowUp");
        pressKey(searchInput, "Enter");
        expect(onSelect).toHaveBeenCalledWith(userTask.entry.action, expect.any(KeyboardEvent));
    });

    it("returns to the templates column with ArrowLeft", () => {
        const { searchInput } = renderOverlay();

        pressKey(searchInput, "ArrowRight");
        pressKey(searchInput, "ArrowLeft");

        expect(highlightedPaletteKey()).toBeNull();
        expect(highlightedTemplate()).toBe("Invoice Worker");
    });

    it("narrows both columns to the search and re-seeds the highlight on the first match", () => {
        const { searchInput, onSelect } = renderOverlay();

        typeInto(searchInput, "gateway");

        expect(container.querySelector(".am-empty-hint")).not.toBeNull();
        expect(paletteKeys()).toEqual(["grp:gateways:append-exclusive-gateway"]);
        expect(highlightedPaletteKey()).toBe("grp:gateways:append-exclusive-gateway");

        pressKey(searchInput, "Enter");
        expect(onSelect).toHaveBeenCalledWith(
            exclusiveGateway.entry.action,
            expect.any(KeyboardEvent),
        );
    });

    it("lets a multi-type template pick its concrete type from the matching palette entries", () => {
        const { searchInput, onSelect, onTemplateTypeSelect } = renderOverlay();

        click(templateCard("Notify Customer"));

        expect(templateCard("Notify Customer")?.classList).toContain("am-template-card--selected");
        expect(paletteKeys()).toEqual([
            "grp:tasks:append-service-task",
            "grp:tasks:append-send-task",
        ]);
        expect(highlightedPaletteKey()).toBe("grp:tasks:append-service-task");

        pressKey(searchInput, "ArrowDown");
        pressKey(searchInput, "Enter");
        expect(onTemplateTypeSelect).toHaveBeenCalledWith(
            notifyCustomer.template,
            "bpmn:SendTask",
            expect.any(KeyboardEvent),
            "email",
        );
        expect(onSelect).not.toHaveBeenCalled();
    });

    it("clears the search that located a multi-type template so its types become pickable", () => {
        const { searchInput } = renderOverlay();
        typeInto(searchInput, "notify");
        expect(paletteKeys()).toEqual([]);

        click(templateCard("Notify Customer"));

        expect(searchInput.value).toBe("");
        expect(paletteKeys()).toEqual([
            "grp:tasks:append-service-task",
            "grp:tasks:append-send-task",
        ]);
        expect(highlightedPaletteKey()).toBe("grp:tasks:append-service-task");
    });

    it("applies a single-type template on click", () => {
        const { onSelect } = renderOverlay();

        click(templateCard("Invoice Worker"));

        expect(onSelect).toHaveBeenCalledWith(invoiceWorker.entry.action, expect.any(MouseEvent));
    });

    it("applies a multi-type template that fixes its element type on click", () => {
        const messageCatch = templateEntry("message", "Message Catch", {
            appliesTo: ["bpmn:IntermediateCatchEvent", "bpmn:IntermediateThrowEvent"],
            template: {
                elementType: {
                    value: "bpmn:IntermediateCatchEvent",
                    eventDefinition: "bpmn:MessageEventDefinition",
                },
            },
        });
        const { onSelect } = renderOverlay({ templateEntries: [messageCatch] });

        click(templateCard("Message Catch"));

        expect(onSelect).toHaveBeenCalledWith(messageCatch.entry.action, expect.any(MouseEvent));
        expect(container.querySelector(".am-template-card--selected")).toBeNull();
    });

    it("backs out of the type pick on the first Escape and cancels on the second", () => {
        const hostEscapeHandler = vi.fn();
        document.body.addEventListener("keydown", hostEscapeHandler);
        const { searchInput, onCancel } = renderOverlay();
        click(templateCard("Notify Customer"));

        pressKey(searchInput, "Escape");
        expect(onCancel).not.toHaveBeenCalled();
        expect(container.querySelector(".am-template-card--selected")).toBeNull();
        expect(paletteKeys()).toContain("grp:tasks:append-user-task");
        expect(highlightedTemplate()).toBe("Invoice Worker");

        pressKey(searchInput, "Escape");
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(hostEscapeHandler).not.toHaveBeenCalled();
        document.body.removeEventListener("keydown", hostEscapeHandler);
    });

    it("cancels on a click outside the panel but not on one inside it", () => {
        const { onCancel } = renderOverlay();

        click(container.querySelector(".am-panel"));
        expect(onCancel).not.toHaveBeenCalled();

        click(container.querySelector(".am-click-away"));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("opens an expanded palette with its first element highlighted when there are no templates", () => {
        renderOverlay({ templateEntries: [] });

        expect(container.querySelector(".am-panel--palette-only")).not.toBeNull();
        expect(container.querySelector(".am-template-panel")).toBeNull();
        expect(isPaletteExpanded()).toBe(true);
        expect(highlightedPaletteKey()).toBe("grp:tasks:append-user-task");
    });

    it("never highlights or activates a disabled element", () => {
        const withDisabledUserTask = group("tasks", "Tasks", [
            ["append-user-task", "User task", { disabled: true }],
            ["append-service-task", "Service task"],
        ]);
        const { searchInput, onSelect } = renderOverlay({
            templateEntries: [],
            bpmnGroups: [withDisabledUserTask],
        });

        expect(highlightedPaletteKey()).toBe("grp:tasks:append-service-task");
        pressKey(searchInput, "ArrowDown");
        pressKey(searchInput, "Enter");

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith(
            withDisabledUserTask.entries[1].entry.action,
            expect.any(KeyboardEvent),
        );
    });

    it("peeks the palette open on hover without unpinning a palette the user expanded", () => {
        renderOverlay();
        expect(isPaletteExpanded()).toBe(false);

        hover(palettePanel(), true);
        expect(isPaletteExpanded()).toBe(true);
        hover(palettePanel(), false);
        expect(isPaletteExpanded()).toBe(false);

        click(container.querySelector(".am-palette-toggle"));
        hover(palettePanel(), true);
        hover(palettePanel(), false);
        expect(isPaletteExpanded()).toBe(true);
    });

    it("keeps the panel inside the canvas when anchored past its edges", () => {
        renderOverlay({ position: { x: 1200, y: 900 } });

        const panel = container.querySelector<HTMLElement>(".am-panel")!;
        // jsdom lays the panel out with zero size, so only the edge margin remains.
        expect(panel.style.left).toBe("992px");
        expect(panel.style.top).toBe("792px");
    });

    it("keeps the panel inside a canvas offset from the viewport origin", () => {
        renderOverlay({
            position: { x: 100, y: 20 },
            canvasBounds: { left: 400, top: 60, right: 1400, bottom: 860 },
        });

        const panel = container.querySelector<HTMLElement>(".am-panel")!;
        expect(panel.style.left).toBe("408px");
        expect(panel.style.top).toBe("68px");
    });

    it("previews the highlighted template with its preset values", () => {
        const steppedTemplate = templateEntry("mail", "Mail › Reminder", {
            appliesTo: ["bpmn:SendTask"],
            presetId: "reminder",
            template: {
                properties: [
                    {
                        id: "subject",
                        label: "Subject",
                        type: "String",
                        value: "Hello",
                        binding: { type: "zeebe:input", name: "subject" },
                    },
                ],
                presets: [{ id: "reminder", properties: { subject: "Payment reminder" } }],
            },
        });

        renderOverlay({ templateEntries: [steppedTemplate] });

        expect(container.querySelector(".am-hover-card-name")?.textContent).toBe("Mail › Reminder");
        expect(container.querySelector(".am-hover-param-value")?.textContent).toBe(
            "Payment reminder",
        );
    });

    describe("hover previews", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it("previews a hovered element and returns to the highlighted one shortly after", () => {
            renderOverlay({ templateEntries: [], bpmnGroups: [describedTasks] });
            expect(previews()).toEqual(["User task"]);

            hover(paletteButton("grp:tasks:append-send-task"), true);
            expect(previews()).toEqual(["Send task"]);

            hover(paletteButton("grp:tasks:append-send-task"), false);
            elapse(HOVER_HIDE_DELAY - 1);
            expect(previews()).toEqual(["Send task"]);
            elapse(1);
            expect(previews()).toEqual(["User task"]);
        });

        it("previews the element the arrow keys move to and describes its button by it", () => {
            const { searchInput } = renderOverlay({
                templateEntries: [],
                bpmnGroups: [describedTasks],
            });

            pressKey(searchInput, "ArrowDown");

            expect(previews()).toEqual(["Service task"]);
            expect(
                paletteButton("grp:tasks:append-service-task")?.getAttribute("aria-describedby"),
            ).toBe(container.querySelector(".am-hover-card")?.id);
        });

        it("shows no preview while the mouse is on an element without a description", () => {
            renderOverlay({ templateEntries: [], bpmnGroups: [describedTasks] });

            hover(paletteButton("grp:tasks:append-manual-task"), true);

            expect(previews()).toEqual([]);
        });

        it("replaces the highlighted template's preview with a hovered element's", () => {
            renderOverlay({ bpmnGroups: [describedTasks] });
            expect(previews()).toEqual(["Invoice Worker"]);

            hover(paletteButton("grp:tasks:append-user-task"), true);
            expect(previews()).toEqual(["User task"]);

            hover(paletteButton("grp:tasks:append-user-task"), false);
            elapse(HOVER_HIDE_DELAY);
            expect(previews()).toEqual(["Invoice Worker"]);
        });

        it("keeps a hovered template's preview open while the mouse travels onto it", () => {
            renderOverlay();
            hover(templateCard("Notify Customer"), true);
            hover(templateCard("Notify Customer"), false);

            hover(container.querySelector(".am-hover-card"), true);
            elapse(HOVER_HIDE_DELAY * 3);
            expect(previews()).toEqual(["Notify Customer"]);

            hover(container.querySelector(".am-hover-card"), false);
            elapse(HOVER_HIDE_DELAY);
            expect(previews()).toEqual(["Invoice Worker"]);
        });

        it("previews in the collapsed palette once a keyword search leaves no template", () => {
            const { searchInput } = renderOverlay({
                templateEntries: [invoiceWorker],
                bpmnGroups: [describedTasks, subProcesses],
            });

            typeInto(searchInput, "child process");

            expect(isPaletteExpanded()).toBe(false);
            expect(highlightedPaletteKey()).toBe("grp:subprocess:append-call-activity");
            expect(previews()).toEqual(["Call activity"]);
        });

        it("drops the hovered element when a search changes the lists", () => {
            const { searchInput } = renderOverlay({
                templateEntries: [],
                bpmnGroups: [describedTasks],
            });
            hover(paletteButton("grp:tasks:append-service-task"), true);

            typeInto(searchInput, "send");

            expect(previews()).toEqual(["Send task"]);
        });
    });
});
