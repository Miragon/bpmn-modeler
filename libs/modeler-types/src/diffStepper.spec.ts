import { describe, expect, it } from "vitest";

import { nearestPresent, stepCursor } from "./diffStepper";

describe("stepCursor", () => {
    it.each([
        { case: "the first Next", cursor: -1, direction: 1, length: 4, next: 0 },
        {
            case: "the first Previous, on the last change",
            cursor: -1,
            direction: -1,
            length: 4,
            next: 3,
        },
        { case: "a Next in the middle", cursor: 1, direction: 1, length: 4, next: 2 },
        {
            case: "a Next past the end, back to the start",
            cursor: 3,
            direction: 1,
            length: 4,
            next: 0,
        },
        {
            case: "a Previous past the start, to the end",
            cursor: 0,
            direction: -1,
            length: 4,
            next: 3,
        },
    ] as const)("lands $case on $next", ({ cursor, direction, length, next }) => {
        expect(stepCursor(cursor, direction, length)).toBe(next);
    });
});

describe("nearestPresent", () => {
    const order = ["a", "b", "c", "d", "e"];

    it.each([
        {
            case: "the step's direction first",
            cursor: 2,
            direction: 1,
            present: ["b", "d"],
            anchor: "d",
        },
        {
            case: "the other direction first when stepping back",
            cursor: 2,
            direction: -1,
            present: ["b", "d"],
            anchor: "b",
        },
        {
            case: "the other direction when the step's has none",
            cursor: 2,
            direction: 1,
            present: ["a"],
            anchor: "a",
        },
        {
            case: "round the end of the cycle",
            cursor: 4,
            direction: 1,
            present: ["b"],
            anchor: "b",
        },
        {
            case: "nothing when no other change is present",
            cursor: 2,
            direction: 1,
            present: ["c"],
            anchor: undefined,
        },
    ] as const)("finds $case", ({ cursor, direction, present, anchor }) => {
        expect(
            nearestPresent(order, cursor, direction, (id) => present.includes(id as never)),
        ).toBe(anchor);
    });
});
