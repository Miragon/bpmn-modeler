import { describe, expect, it } from "vitest";

import { diffElementIssues, type ElementIssue, type ElementIssues } from "./lintIssueDiff";

function issue(message: string, overrides: Partial<ElementIssue> = {}): ElementIssue {
    return { rule: "label-required", category: "warn", message, ...overrides };
}

const allRendered = () => true;

describe("diffElementIssues", () => {
    it("reports nothing for identical content in fresh objects", () => {
        const previous: ElementIssues = { Task_1: [issue("a")], Task_2: [issue("b")] };
        const next: ElementIssues = { Task_1: [issue("a")], Task_2: [issue("b")] };

        expect(diffElementIssues(previous, next, allRendered)).toEqual({
            staleElementIds: [],
            freshElementIds: [],
        });
    });

    it("redraws only the element whose issues changed", () => {
        const previous: ElementIssues = { Task_1: [issue("a")], Task_2: [issue("b")] };
        const next: ElementIssues = {
            Task_1: [issue("a")],
            Task_2: [issue("b", { category: "error" })],
        };

        expect(diffElementIssues(previous, next, allRendered)).toEqual({
            staleElementIds: ["Task_2"],
            freshElementIds: ["Task_2"],
        });
    });

    it("removes elements without issues and adds new ones", () => {
        const previous: ElementIssues = { Task_1: [issue("a")] };
        const next: ElementIssues = { Task_2: [issue("a")] };

        expect(diffElementIssues(previous, next, allRendered)).toEqual({
            staleElementIds: ["Task_1"],
            freshElementIds: ["Task_2"],
        });
    });

    it("redraws unchanged issues whose overlay is gone", () => {
        const previous: ElementIssues = { Task_1: [issue("a")], Task_2: [issue("b")] };
        const next: ElementIssues = { Task_1: [issue("a")], Task_2: [issue("b")] };

        expect(diffElementIssues(previous, next, (id) => id !== "Task_2")).toEqual({
            staleElementIds: ["Task_2"],
            freshElementIds: ["Task_2"],
        });
    });

    it.each<[string, ElementIssue]>([
        ["rule", issue("a", { rule: "other-rule" })],
        ["message", issue("changed")],
        ["child issue source", issue("a", { isChildIssue: true, actualElementId: "Hidden_1" })],
        ["documentation link", issue("a", { meta: { documentation: { url: "https://x" } } })],
    ])("detects a changed %s", (_, changedIssue) => {
        const previous: ElementIssues = { Task_1: [issue("a")] };

        expect(diffElementIssues(previous, { Task_1: [changedIssue] }, allRendered)).toEqual({
            staleElementIds: ["Task_1"],
            freshElementIds: ["Task_1"],
        });
    });

    it("detects reordered issues, which the overlay renders in order", () => {
        const previous: ElementIssues = { Task_1: [issue("a"), issue("b")] };
        const next: ElementIssues = { Task_1: [issue("b"), issue("a")] };

        expect(diffElementIssues(previous, next, allRendered).freshElementIds).toEqual(["Task_1"]);
    });
});
