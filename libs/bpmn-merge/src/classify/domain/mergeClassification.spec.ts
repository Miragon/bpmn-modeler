import { describe, expect, it } from "vitest";

import { type ClassifiedVersions, elementStateOf, layoutStateOf } from "./mergeClassification";
import type { ElementState, LayoutState } from "../../kernel/domain/mergeResult";

const holding = (key: string, layout?: string) =>
    layout === undefined ? { key } : { key, layout };

describe("elementStateOf with a base", () => {
    it.each<{ row: string; versions: ClassifiedVersions; state: ElementState }>([
        {
            row: "nobody changed it",
            versions: { base: holding("a"), current: holding("a"), incoming: holding("a") },
            state: "unchanged",
        },
        {
            row: "only current changed it",
            versions: { base: holding("a"), current: holding("c"), incoming: holding("a") },
            state: "takenFromCurrent",
        },
        {
            row: "only incoming changed it",
            versions: { base: holding("a"), current: holding("a"), incoming: holding("i") },
            state: "takenFromIncoming",
        },
        {
            row: "both changed it alike",
            versions: { base: holding("a"), current: holding("b"), incoming: holding("b") },
            state: "sameChange",
        },
        {
            row: "both changed it differently",
            versions: { base: holding("a"), current: holding("c"), incoming: holding("i") },
            state: "bothChanged",
        },
        {
            row: "only current added it",
            versions: { current: holding("c") },
            state: "addedByCurrent",
        },
        {
            row: "only incoming added it",
            versions: { incoming: holding("i") },
            state: "addedByIncoming",
        },
        {
            row: "both added it alike",
            versions: { current: holding("b"), incoming: holding("b") },
            state: "sameAddition",
        },
        {
            row: "both added it differently",
            versions: { current: holding("c"), incoming: holding("i") },
            state: "bothAdded",
        },
        {
            row: "current removed it, incoming kept it",
            versions: { base: holding("a"), incoming: holding("a") },
            state: "removedByCurrent",
        },
        {
            row: "incoming removed it, current kept it",
            versions: { base: holding("a"), current: holding("a") },
            state: "removedByIncoming",
        },
        { row: "both removed it", versions: { base: holding("a") }, state: "removedByBoth" },
        {
            row: "current removed it, incoming changed it",
            versions: { base: holding("a"), incoming: holding("i") },
            state: "removedAndChanged",
        },
        {
            row: "current changed it, incoming removed it",
            versions: { base: holding("a"), current: holding("c") },
            state: "changedAndRemoved",
        },
    ])("is $state when $row", ({ versions, state }) => {
        expect(elementStateOf(versions, true)).toBe(state);
    });

    it("ignores the layout", () => {
        expect(
            elementStateOf(
                {
                    base: holding("a", "x"),
                    current: holding("a", "y"),
                    incoming: holding("a", "z"),
                },
                true,
            ),
        ).toBe("unchanged");
    });
});

describe("elementStateOf without a base", () => {
    it.each<{ row: string; versions: ClassifiedVersions; state: ElementState }>([
        {
            row: "both sides hold it alike",
            versions: { current: holding("a"), incoming: holding("a") },
            state: "unchanged",
        },
        {
            row: "the sides hold it differently",
            versions: { current: holding("c"), incoming: holding("i") },
            state: "differs",
        },
        {
            row: "only current holds it",
            versions: { current: holding("c") },
            state: "onlyInCurrent",
        },
        {
            row: "only incoming holds it",
            versions: { incoming: holding("i") },
            state: "onlyInIncoming",
        },
    ])("is $state when $row", ({ versions, state }) => {
        expect(elementStateOf(versions, false)).toBe(state);
    });
});

describe("layoutStateOf", () => {
    it.each<{ row: string; versions: ClassifiedVersions; layout: LayoutState }>([
        {
            row: "nobody moved it",
            versions: {
                base: holding("a", "x"),
                current: holding("c", "x"),
                incoming: holding("i", "x"),
            },
            layout: "unchanged",
        },
        {
            row: "only current moved it",
            versions: {
                base: holding("a", "x"),
                current: holding("a", "y"),
                incoming: holding("a", "x"),
            },
            layout: "takenFromCurrent",
        },
        {
            row: "only incoming moved it",
            versions: {
                base: holding("a", "x"),
                current: holding("a", "x"),
                incoming: holding("a", "y"),
            },
            layout: "takenFromIncoming",
        },
        {
            row: "both moved it differently",
            versions: {
                base: holding("a", "x"),
                current: holding("a", "y"),
                incoming: holding("a", "z"),
            },
            layout: "bothChanged",
        },
        {
            row: "both moved it alike",
            versions: {
                base: holding("a", "x"),
                current: holding("a", "y"),
                incoming: holding("a", "y"),
            },
            layout: "bothChanged",
        },
        {
            row: "current stopped drawing it",
            versions: {
                base: holding("a", "x"),
                current: holding("a"),
                incoming: holding("a", "x"),
            },
            layout: "takenFromCurrent",
        },
        {
            row: "incoming moved what current removed",
            versions: { base: holding("a", "x"), incoming: holding("a", "y") },
            layout: "takenFromIncoming",
        },
        {
            row: "incoming kept what current removed",
            versions: { base: holding("a", "x"), incoming: holding("a", "x") },
            layout: "unchanged",
        },
        {
            row: "current moved what incoming removed",
            versions: { base: holding("a", "x"), current: holding("a", "y") },
            layout: "takenFromCurrent",
        },
        { row: "both removed it", versions: { base: holding("a", "x") }, layout: "unchanged" },
        {
            row: "nobody draws it",
            versions: { base: holding("a"), current: holding("c"), incoming: holding("i") },
            layout: "unchanged",
        },
        {
            row: "both sides draw it alike without a base",
            versions: { current: holding("c", "x"), incoming: holding("i", "x") },
            layout: "unchanged",
        },
        {
            row: "the sides draw it differently without a base",
            versions: { current: holding("a", "x"), incoming: holding("a", "y") },
            layout: "bothChanged",
        },
        {
            row: "only current draws it without a base",
            versions: { current: holding("a", "x"), incoming: holding("a") },
            layout: "bothChanged",
        },
        {
            row: "only current holds and draws it",
            versions: { current: holding("c", "x") },
            layout: "takenFromCurrent",
        },
        {
            row: "only incoming holds and draws it",
            versions: { incoming: holding("i", "x") },
            layout: "takenFromIncoming",
        },
        {
            row: "only incoming holds it, undrawn",
            versions: { incoming: holding("i") },
            layout: "unchanged",
        },
    ])("is $layout when $row", ({ versions, layout }) => {
        expect(layoutStateOf(versions)).toBe(layout);
    });
});
