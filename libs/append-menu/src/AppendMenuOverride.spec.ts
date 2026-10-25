import type { ElementTemplate } from "@miragon/bpmn-modeler-element-template-chooser";
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { click, pressKey } from "./__fixtures__/dom";
import { AppendMenuOverride } from "./AppendMenuOverride";
import type { PopupMenuEntry } from "./types";

const TASKS = { id: "tasks", name: "Tasks" };

function paletteEntry(label: string): PopupMenuEntry {
    return { label, group: TASKS, action: vi.fn<(event: Event) => void>() };
}

const notifyTemplate: ElementTemplate = {
    id: "notify",
    name: "Notify Customer",
    appliesTo: ["bpmn:ServiceTask", "bpmn:SendTask"],
    properties: [],
};

function menuEntries(): Record<string, PopupMenuEntry> {
    return {
        "append-task": paletteEntry("Task"),
        "append-user-task": paletteEntry("User task"),
        "append-service-task": paletteEntry("Service task"),
        "append-send-task": paletteEntry("Send task"),
        "append-receive-task": paletteEntry("Receive task"),
        "append-manual-task": paletteEntry("Manual task"),
        "append-script-task": paletteEntry("Script task"),
        "append-call-activity": paletteEntry("Call activity"),
        "append.template-notify": { label: "Notify Customer", action: () => {} },
    };
}

class FakeEventBus {
    private readonly listeners = new Map<string, () => void>();

    on(events: string | string[], listener: () => void): void {
        for (const event of [events].flat()) {
            this.listeners.set(event, listener);
        }
    }

    fire(event: string): void {
        act(() => this.listeners.get(event)?.());
    }
}

let themedHost: HTMLElement;

beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
    document.querySelectorAll(".am-overlay-root").forEach((root) => {
        render(null, root);
        root.remove();
    });
    themedHost.remove();
});

function createOverride(services: Record<string, unknown> = {}) {
    const entries = menuEntries();
    const defaultPopup = {
        open: vi.fn(),
        close: vi.fn(),
        isOpen: vi.fn(() => false),
    };
    const popupMenu = {
        ...defaultPopup,
        _getContext: () => ({ entries, headerEntries: {}, empty: false }),
    };

    themedHost = document.createElement("div");
    themedHost.setAttribute("data-bpmn-theme", "dark");
    const canvasContainer = document.createElement("div");
    themedHost.appendChild(canvasContainer);
    document.body.appendChild(themedHost);
    const canvas = { getContainer: () => canvasContainer, focus: vi.fn() };

    const eventBus = new FakeEventBus();
    const override = new AppendMenuOverride(popupMenu, canvas, eventBus, {
        get: <T>(name: string) => (services[name] ?? null) as T | null,
    });

    const target = { id: "StartEvent_1" };
    const openMenu = (providerId = "bpmn-append") =>
        act(() => popupMenu.open(target, providerId, { x: 40, y: 60 }));

    return { popupMenu, defaultPopup, canvas, eventBus, override, entries, target, openMenu };
}

const overlayRoots = () => document.querySelectorAll<HTMLElement>(".am-overlay-root");
const paletteButton = (entryId: string) =>
    document.querySelector(`.am-overlay-root [data-nav-key="grp:tasks:${entryId}"]`);

describe("AppendMenuOverride", () => {
    it("leaves other popup menus to diagram-js", () => {
        const { defaultPopup, target, openMenu } = createOverride();

        openMenu("bpmn-replace");

        expect(defaultPopup.open).toHaveBeenCalledWith(
            target,
            "bpmn-replace",
            { x: 40, y: 60 },
            undefined,
        );
        expect(overlayRoots()).toHaveLength(0);
    });

    it.each(["bpmn-append", "bpmn-create"])(
        "renders the %s menu in its own overlay in the instance theme",
        (providerId) => {
            const { popupMenu, defaultPopup, openMenu } = createOverride();

            openMenu(providerId);

            expect(defaultPopup.open).not.toHaveBeenCalled();
            expect(overlayRoots()).toHaveLength(1);
            expect(overlayRoots()[0].getAttribute("data-bpmn-theme")).toBe("dark");
            expect(popupMenu.isOpen()).toBe(true);
        },
    );

    it("closes an open default popup before showing the overlay", () => {
        const { defaultPopup, openMenu } = createOverride();
        defaultPopup.isOpen.mockReturnValue(true);

        openMenu();

        expect(defaultPopup.close).toHaveBeenCalledTimes(1);
        expect(overlayRoots()).toHaveLength(1);
    });

    it("replaces a previous overlay when opened again", () => {
        const { openMenu } = createOverride();

        openMenu();
        openMenu();

        expect(overlayRoots()).toHaveLength(1);
    });

    it("tears the overlay down when diagram-js closes the popup menu", () => {
        const { popupMenu, defaultPopup, openMenu } = createOverride();
        openMenu();

        act(() => popupMenu.close());

        expect(overlayRoots()).toHaveLength(0);
        expect(defaultPopup.close).toHaveBeenCalled();
        expect(popupMenu.isOpen()).toBe(false);
    });

    it.each(["contextPad.close", "canvas.viewbox.changing", "commandStack.changed"])(
        "closes the overlay on %s",
        (event) => {
            const { eventBus, openMenu } = createOverride();
            openMenu();

            eventBus.fire(event);

            expect(overlayRoots()).toHaveLength(0);
        },
    );

    it("runs the chosen entry, then hands focus back to the canvas after it settles", async () => {
        const { canvas, entries, openMenu } = createOverride();
        openMenu();

        click(paletteButton("append-user-task"));

        expect(entries["append-user-task"].action).toHaveBeenCalledWith(expect.any(MouseEvent));
        expect(overlayRoots()).toHaveLength(0);
        expect(canvas.focus).not.toHaveBeenCalled();
        await Promise.resolve();
        expect(canvas.focus).toHaveBeenCalledTimes(1);
    });

    it("leaves focus with a label edit the chosen entry started", async () => {
        const { canvas, openMenu } = createOverride({
            directEditing: { isActive: () => true },
        });
        openMenu();

        click(paletteButton("append-user-task"));
        await Promise.resolve();

        expect(canvas.focus).not.toHaveBeenCalled();
    });

    it("returns focus to the canvas when the menu is cancelled", () => {
        const { canvas, openMenu } = createOverride();
        openMenu();

        pressKey(document.querySelector(".am-search-input")!, "Escape");

        expect(overlayRoots()).toHaveLength(0);
        expect(canvas.focus).toHaveBeenCalledTimes(1);
    });

    it("still opens with the BPMN elements when the templates cannot be loaded", () => {
        const { openMenu } = createOverride({
            elementTemplates: {
                getLatest: () => {
                    throw new Error("templates not loaded");
                },
                createElement: vi.fn(),
            },
        });

        openMenu();

        expect(paletteButton("append-user-task")).not.toBeNull();
    });

    it("pins at most six favourites, in the configured order", () => {
        const { override, openMenu } = createOverride();
        override.setFavourites([
            "bpmn:UserTask",
            "bpmn:ServiceTask",
            "bpmn:SendTask",
            "bpmn:ReceiveTask",
            "bpmn:ManualTask",
            "bpmn:ScriptTask",
            "bpmn:CallActivity",
            "bpmn:Task",
        ]);

        openMenu();

        const favourites = [
            ...document.querySelectorAll(".am-bpmn-group--favourites .am-bpmn-button"),
        ].map((favourite) => favourite.getAttribute("title"));
        expect(favourites).toEqual([
            "User task",
            "Service task",
            "Send task",
            "Receive task",
            "Manual task",
            "Script task",
        ]);
    });

    it("renders the menu through the modeler's translate service", () => {
        const { openMenu } = createOverride({ translate: (text: string) => `de:${text}` });

        openMenu();

        expect(document.querySelector<HTMLInputElement>(".am-search-input")?.placeholder).toBe(
            "de:Search...",
        );
    });

    it("creates a multi-type template as the type picked from the palette", () => {
        const createdElement = { id: "created" };
        const elementTemplates = {
            getLatest: () => [notifyTemplate],
            createElement: vi.fn(() => createdElement),
        };
        const autoPlace = { append: vi.fn() };
        const { target, openMenu } = createOverride({
            elementTemplates,
            autoPlace,
            create: { start: vi.fn() },
        });
        openMenu();

        click(document.querySelector(".am-template-card"));
        click(paletteButton("append-send-task"));

        expect(elementTemplates.createElement).toHaveBeenCalledWith(
            { ...notifyTemplate, elementType: { value: "bpmn:SendTask" } },
            { presetId: undefined },
        );
        expect(autoPlace.append).toHaveBeenCalledWith(target, createdElement);
        expect(overlayRoots()).toHaveLength(0);
    });
});
