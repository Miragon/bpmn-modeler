import { describe, expect, it } from "vitest";

import { bySeverity, mostSevere, type Severity } from "./severity";

function found(...severities: Severity[]): { severity: Severity; at: number }[] {
    return severities.map((severity, at) => ({ severity, at }));
}

describe("severity", () => {
    it.each([
        [found("info", "warning", "error"), [2, 1, 0]],
        [found("warning", "info", "error", "warning"), [2, 0, 3, 1]],
        [found("info", "info"), [0, 1]],
        [found(), []],
    ])("lists the most severe first and keeps equals in their order", (items, order) => {
        expect([...items].sort(bySeverity).map(({ at }) => at)).toEqual(order);
    });

    it.each([
        [found(), undefined],
        [found("info"), 0],
        [found("info", "warning", "info"), 1],
        [found("warning", "error", "error"), 1],
        [found("error", "warning", "error"), 0],
    ])("picks the first of the most severe", (items, at) => {
        expect(mostSevere(items)?.at).toBe(at);
    });
});
