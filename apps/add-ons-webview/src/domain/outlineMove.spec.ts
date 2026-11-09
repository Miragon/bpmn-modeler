import { describe, expect, it } from "vitest";

import {
    ACME,
    CATALOG,
    CONFIG_SOURCE,
    MARKETPLACE_SOURCE,
    PACKAGES_SOURCE,
    PALETTE,
    RESIZE,
} from "../__fixtures__/catalogs";
import { Expansion, visibleHeadsOf } from "./outline";
import {
    isOutlineKey,
    OutlineKey,
    OutlineMove,
    outlineMoveOf,
    typeAheadTarget,
    typedAhead,
} from "./outlineMove";

const CLOSED_WORK: Expansion = new Map([["folder:/work", false]]);

describe("outlineMoveOf", () => {
    it.each<{
        case: string;
        key: OutlineKey;
        active: string;
        expansion?: Expansion;
        move: OutlineMove;
    }>([
        {
            case: "↓ to the next head",
            key: "ArrowDown",
            active: PALETTE.id,
            move: { kind: "focus", headId: RESIZE.id },
        },
        {
            case: "↓ from a header into its first child",
            key: "ArrowDown",
            active: "folder:/work",
            move: { kind: "focus", headId: CONFIG_SOURCE.id },
        },
        {
            case: "↓ nowhere from the last head",
            key: "ArrowDown",
            active: MARKETPLACE_SOURCE.id,
            move: { kind: "none" },
        },
        {
            case: "↓ past a closed group's heads",
            key: "ArrowDown",
            active: "folder:/work",
            expansion: CLOSED_WORK,
            move: { kind: "focus", headId: "marketplaces" },
        },
        {
            case: "↑ to the previous head",
            key: "ArrowUp",
            active: PACKAGES_SOURCE.id,
            move: { kind: "focus", headId: RESIZE.id },
        },
        {
            case: "↑ nowhere from the first head",
            key: "ArrowUp",
            active: "folder:/work",
            move: { kind: "none" },
        },
        {
            case: "Home to the first head",
            key: "Home",
            active: ACME.id,
            move: { kind: "focus", headId: "folder:/work" },
        },
        {
            case: "End to the last visible head",
            key: "End",
            active: PALETTE.id,
            move: { kind: "focus", headId: MARKETPLACE_SOURCE.id },
        },
        {
            case: "→ opens a closed header",
            key: "ArrowRight",
            active: MARKETPLACE_SOURCE.id,
            move: { kind: "toggle", headId: MARKETPLACE_SOURCE.id },
        },
        {
            case: "→ enters an open header",
            key: "ArrowRight",
            active: CONFIG_SOURCE.id,
            move: { kind: "focus", headId: PALETTE.id },
        },
        {
            case: "→ does nothing on a row",
            key: "ArrowRight",
            active: RESIZE.id,
            move: { kind: "none" },
        },
        {
            case: "← closes an open header",
            key: "ArrowLeft",
            active: CONFIG_SOURCE.id,
            move: { kind: "toggle", headId: CONFIG_SOURCE.id },
        },
        {
            case: "← goes from a row to its source",
            key: "ArrowLeft",
            active: ACME.id,
            move: { kind: "focus", headId: PACKAGES_SOURCE.id },
        },
        {
            case: "← goes from a closed source to its group",
            key: "ArrowLeft",
            active: MARKETPLACE_SOURCE.id,
            move: { kind: "focus", headId: "marketplaces" },
        },
        {
            case: "← does nothing on a closed group",
            key: "ArrowLeft",
            active: "folder:/work",
            expansion: CLOSED_WORK,
            move: { kind: "none" },
        },
        {
            case: "Enter leaves a header to its own press",
            key: "Enter",
            active: "marketplaces",
            move: { kind: "press", headId: "marketplaces" },
        },
        {
            case: "Space leaves a header to its own press",
            key: " ",
            active: CONFIG_SOURCE.id,
            move: { kind: "press", headId: CONFIG_SOURCE.id },
        },
        {
            case: "Enter takes a row to its controls",
            key: "Enter",
            active: RESIZE.id,
            move: { kind: "controls", headId: RESIZE.id },
        },
        {
            case: "nothing for a head no longer shown",
            key: "ArrowDown",
            active: "folder:/gone",
            move: { kind: "none" },
        },
    ])("$case", ({ key, active, expansion = new Map(), move }) => {
        expect(outlineMoveOf(key, active, visibleHeadsOf(CATALOG, expansion), expansion)).toEqual(
            move,
        );
    });
});

describe("isOutlineKey", () => {
    it.each([
        ["ArrowDown", true],
        ["Enter", true],
        [" ", true],
        ["Tab", false],
        ["a", false],
    ])("%s → %s", (key, expected) => {
        expect(isOutlineKey(key as string)).toBe(expected);
    });
});

describe("type-ahead", () => {
    const visible = visibleHeadsOf(CATALOG, new Map());

    it.each<{ case: string; typed: string; active: string; target: string | undefined }>([
        {
            case: "the next head whose name starts with the letter",
            typed: "p",
            active: "folder:/work",
            target: PALETTE.id,
        },
        {
            case: "past the active head, wrapping around",
            typed: "w",
            active: RESIZE.id,
            target: "folder:/work",
        },
        {
            case: "the active head while more letters still match it",
            typed: "pal",
            active: PALETTE.id,
            target: PALETTE.id,
        },
        { case: "regardless of case", typed: "R", active: "folder:/work", target: RESIZE.id },
        {
            case: "nothing when no name matches",
            typed: "zz",
            active: PALETTE.id,
            target: undefined,
        },
    ])("finds $case", ({ typed, active, target }) => {
        expect(typeAheadTarget({ text: typed, at: 0 }, active, visible)).toBe(target);
    });

    it.each([
        {
            case: "adds a letter typed soon after",
            previous: { text: "p", at: 1000 },
            at: 1400,
            text: "pa",
        },
        {
            case: "starts again after a pause",
            previous: { text: "p", at: 1000 },
            at: 1600,
            text: "a",
        },
        { case: "starts with the first letter", previous: undefined, at: 5, text: "a" },
    ])("$case", ({ previous, at, text }) => {
        expect(typedAhead(previous, "a", at)).toEqual({ text, at });
    });
});
