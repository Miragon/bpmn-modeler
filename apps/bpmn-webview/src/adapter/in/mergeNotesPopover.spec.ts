import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MergePaneBuildNote } from "@miragon/bpmn-modeler-shared";

import { MergeNotesPopover } from "./mergeNotesPopover";

const translate = (key: string, replacements: Record<string, string> = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? name);

const NOTES: readonly MergePaneBuildNote[] = [
    { kind: "restoredWithoutConnections", id: "Task_A", connections: ["Flow_1"] },
    { kind: "layoutChangedByBoth", ids: ["Task_A", "Gateway_1"], keptSide: "incoming" },
    { kind: "frameDiffers", attribute: "exporter" },
];

describe("MergeNotesPopover", () => {
    let opener: HTMLButtonElement;
    let outside: HTMLButtonElement;
    let popover: MergeNotesPopover;
    let onSelect: ReturnType<typeof vi.fn<(elementId: string) => void>>;
    let onClosed: ReturnType<typeof vi.fn<() => void>>;
    const nameOf = (id: string) => ({ Task_A: "Send invoice" })[id] ?? id;
    const buttons = () =>
        [...popover.element.querySelectorAll<HTMLButtonElement>("button")].map(
            (button) => button.textContent,
        );

    beforeEach(() => {
        onSelect = vi.fn<(elementId: string) => void>();
        onClosed = vi.fn<() => void>();
        opener = document.createElement("button");
        outside = document.createElement("button");
        popover = new MergeNotesPopover(translate, onSelect, opener, onClosed);
        document.body.append(opener, outside, popover.element);
        popover.update({ notes: NOTES, nameOf });
    });

    afterEach(() => {
        opener.remove();
        outside.remove();
        popover.close(false);
        popover.element.remove();
    });

    it("lists each note in words with a button per element it names, which shows it", () => {
        popover.open();

        expect(popover.element.textContent).toContain(
            "Send invoice is kept without the flows the other side removed with it: Flow_1",
        );
        expect(popover.element.textContent).toContain(
            "Both sides changed the layout of Send invoice, Gateway_1; incoming's is kept",
        );
        expect(buttons()).toStrictEqual([
            "×",
            "Send invoice",
            "Flow_1",
            "Send invoice",
            "Gateway_1",
        ]);
        [...popover.element.querySelectorAll<HTMLButtonElement>("button")]
            .find((button) => button.textContent === "Gateway_1")
            ?.click();
        expect(onSelect).toHaveBeenCalledWith("Gateway_1");
    });

    it("opens with the focus on its close button and is named for screen readers", () => {
        popover.open();

        expect(popover.isOpen()).toBe(true);
        expect(document.activeElement?.getAttribute("aria-label")).toBe("Close");
        expect(popover.element.getAttribute("role")).toBe("dialog");
        expect(popover.element.getAttribute("aria-label")).toBe("Notes of the build");
    });

    it("closes on Escape and on ×, and gives the focus back to its opener", () => {
        for (const close of [
            () =>
                document.activeElement?.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
                ),
            () => popover.element.querySelector<HTMLButtonElement>("button")?.click(),
        ]) {
            popover.open();

            close();

            expect(popover.isOpen()).toBe(false);
            expect(document.activeElement).toBe(opener);
        }
        expect(onClosed).toHaveBeenCalledTimes(2);
    });

    it("closes on a click outside it, leaving the focus where the click put it", () => {
        popover.open();

        outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));

        expect(popover.isOpen()).toBe(false);
        expect(onClosed).toHaveBeenCalledOnce();
    });

    it("stays open on a click inside it or on its opener, which toggles it", () => {
        popover.open();

        popover.element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        opener.dispatchEvent(new Event("pointerdown", { bubbles: true }));

        expect(popover.isOpen()).toBe(true);
    });

    it("closes once a build leaves no notes", () => {
        popover.open();

        popover.update({ notes: [], nameOf });

        expect(popover.isOpen()).toBe(false);
    });

    it("keeps the focused element button when the same notes arrive again", () => {
        popover.open();
        const focused = popover.element.querySelectorAll<HTMLButtonElement>("button")[2];
        focused.focus();

        popover.update({ notes: [...NOTES], nameOf });

        expect(document.activeElement).toBe(focused);
    });
});
