import { describe, expect, it } from "vitest";

import { createPopupDraftInput, type PopupEventBus } from "./popupDraftInput";

type Listener = (event: unknown, context?: unknown) => unknown;

/**
 * The slice of diagram-js's EventBus the panel's pop-up relies on: listeners run by
 * priority, receive the fired object itself, and one returning a value stops the rest.
 */
function priorityEventBus(): PopupEventBus {
    const listeners = new Map<string, { priority: number; callback: Listener }[]>();
    return {
        on(event, priority, callback) {
            const forEvent = listeners.get(event) ?? [];
            forEvent.push({ priority, callback: callback as Listener });
            forEvent.sort((first, second) => second.priority - first.priority);
            listeners.set(event, forEvent);
        },
        fire(event, context) {
            for (const { callback } of [...(listeners.get(event) ?? [])]) {
                const returned = callback({ type: event }, context);
                if (returned !== undefined) return returned;
            }
            return undefined;
        },
    };
}

interface OpenContext {
    onInput(value: string): void;
}

/** Mirrors `@bpmn-io/properties-panel`'s FEEL entry and pop-up service: the draft applies on close. */
function feelEntryWithPopup(eventBus: PopupEventBus) {
    const applied: string[] = [];
    let open = false;
    eventBus.on("propertiesPanel.openPopup", 1000, () => {
        open = true;
        return true;
    });
    eventBus.on("propertiesPanel.closePopup", 1000, () => {
        if (!open) return;
        open = false;
        eventBus.fire("propertiesPanelPopup.close");
    });

    return {
        applied,
        isOpen: () => open,
        openPopup(): OpenContext {
            let draft: string | undefined;
            const context: OpenContext = {
                onInput: (value) => {
                    draft = value;
                },
            };
            eventBus.fire("propertiesPanel.openPopup", context);
            const applyOnce = () => {
                if (draft !== undefined) applied.push(draft);
                draft = undefined;
            };
            eventBus.on("propertiesPanelPopup.close", 1000, applyOnce);
            return context;
        },
    };
}

function trackedEntry() {
    const eventBus = priorityEventBus();
    const entry = feelEntryWithPopup(eventBus);
    const popupDrafts = createPopupDraftInput();
    popupDrafts.track(eventBus);
    return { eventBus, entry, popupDrafts };
}

describe("pop-up draft input", () => {
    it("holds nothing while no pop-up is open", () => {
        const { popupDrafts } = trackedEntry();

        expect(popupDrafts.hasPending()).toBe(false);
    });

    it("holds nothing for an open pop-up nothing was typed into", () => {
        const { entry, popupDrafts } = trackedEntry();

        entry.openPopup();

        expect(popupDrafts.hasPending()).toBe(false);
    });

    it("holds what is typed into the open pop-up and still hands it to the entry", () => {
        const { entry, popupDrafts } = trackedEntry();

        entry.openPopup().onInput("=amount > 100");

        expect(popupDrafts.hasPending()).toBe(true);
        expect(entry.applied).toEqual([]);
    });

    it("applies the typed draft by closing the pop-up on a flush", () => {
        const { entry, popupDrafts } = trackedEntry();
        entry.openPopup().onInput("=amount > 100");

        popupDrafts.flush();

        expect(entry.applied).toEqual(["=amount > 100"]);
        expect(entry.isOpen()).toBe(false);
        expect(popupDrafts.hasPending()).toBe(false);
    });

    it("leaves a pop-up nothing was typed into open on a flush", () => {
        const { entry, popupDrafts } = trackedEntry();
        entry.openPopup();

        popupDrafts.flush();

        expect(entry.isOpen()).toBe(true);
    });

    it("holds nothing once the user closes the pop-up", () => {
        const { eventBus, entry, popupDrafts } = trackedEntry();
        entry.openPopup().onInput("=amount > 100");

        eventBus.fire("propertiesPanel.closePopup");

        expect(entry.applied).toEqual(["=amount > 100"]);
        expect(popupDrafts.hasPending()).toBe(false);
    });

    it("starts clean for the next pop-up after one was typed into", () => {
        const { entry, popupDrafts } = trackedEntry();
        entry.openPopup().onInput("=first");

        entry.openPopup();

        expect(popupDrafts.hasPending()).toBe(false);
    });

    it("keeps the pop-ups of separate views apart and flushes each", () => {
        const popupDrafts = createPopupDraftInput();
        const firstBus = priorityEventBus();
        const secondBus = priorityEventBus();
        const first = feelEntryWithPopup(firstBus);
        const second = feelEntryWithPopup(secondBus);
        popupDrafts.track(firstBus);
        popupDrafts.track(secondBus);
        first.openPopup().onInput("=first");
        second.openPopup();

        expect(popupDrafts.hasPending()).toBe(true);
        popupDrafts.flush();

        expect(first.applied).toEqual(["=first"]);
        expect(first.isOpen()).toBe(false);
        expect(second.isOpen()).toBe(true);
    });
});
