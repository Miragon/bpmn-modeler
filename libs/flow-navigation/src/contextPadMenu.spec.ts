import { describe, expect, it, vi } from "vitest";

import { buildMenuEntries, type PadEntry } from "./contextPadMenu";

describe("buildMenuEntries", () => {
    it("uses title as label, falls back to entryId", () => {
        const trigger = vi.fn();
        const entries: Record<string, PadEntry> = {
            myEntry: { title: "My Title", action: vi.fn() },
            noTitle: { action: vi.fn() },
        };

        const result = buildMenuEntries(entries, trigger);

        expect(result.myEntry.label).toBe("My Title");
        expect(result.noTitle.label).toBe("noTitle");
    });

    it("passes through className and imageUrl", () => {
        const trigger = vi.fn();
        const entries: Record<string, PadEntry> = {
            styled: {
                title: "Styled",
                className: "bpmn-icon-task",
                imageUrl: "https://example.com/icon.svg",
                action: vi.fn(),
            },
        };

        const result = buildMenuEntries(entries, trigger);

        expect(result.styled.className).toBe("bpmn-icon-task");
        expect(result.styled.imageUrl).toBe("https://example.com/icon.svg");
    });

    it("filters out entries without an action", () => {
        const trigger = vi.fn();
        const entries: Record<string, PadEntry> = {
            noAction: { title: "No Action" },
            hasAction: { title: "Has Action", action: vi.fn() },
        };

        const result = buildMenuEntries(entries, trigger);

        expect(result.noAction).toBeUndefined();
        expect(result.hasAction).toBeDefined();
    });

    it("filters out drag-only entries (action without click)", () => {
        const trigger = vi.fn();
        const entries: Record<string, PadEntry> = {
            dragOnly: { title: "Drag", action: { dragstart: vi.fn() } },
            clickable: { title: "Click", action: { click: vi.fn() } },
        };

        const result = buildMenuEntries(entries, trigger);

        expect(result.dragOnly).toBeUndefined();
        expect(result.clickable).toBeDefined();
    });

    it("adds shortcut hints on append, replace, delete", () => {
        const trigger = vi.fn();
        const entries: Record<string, PadEntry> = {
            append: { title: "Append", action: vi.fn() },
            replace: { title: "Replace", action: vi.fn() },
            delete: { title: "Delete", action: vi.fn() },
            connect: { title: "Connect", action: vi.fn() },
        };

        const result = buildMenuEntries(entries, trigger);

        expect(result.append.description).toBe("A");
        expect(result.replace.description).toBe("R");
        expect(result.delete.description).toBe("Del");
        expect(result.connect.description).toBeUndefined();
    });

    it("preserves insertion order", () => {
        const trigger = vi.fn();
        const entries: Record<string, PadEntry> = {
            first: { title: "First", action: vi.fn() },
            second: { title: "Second", action: vi.fn() },
            third: { title: "Third", action: vi.fn() },
        };

        const result = buildMenuEntries(entries, trigger);

        expect(Object.keys(result)).toEqual(["first", "second", "third"]);
    });

    it("action calls trigger with the entry id", () => {
        const trigger = vi.fn();
        const entries: Record<string, PadEntry> = {
            myEntry: { title: "My Entry", action: vi.fn() },
        };

        const result = buildMenuEntries(entries, trigger);
        result.myEntry.action();

        expect(trigger).toHaveBeenCalledWith("myEntry");
    });
});
