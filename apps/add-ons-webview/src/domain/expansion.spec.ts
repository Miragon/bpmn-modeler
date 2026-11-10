import { describe, expect, it } from "vitest";

import {
    ACME,
    CATALOG,
    CONFIG_SOURCE,
    MAIL,
    MARKETPLACE_SOURCE,
    PACKAGES_SOURCE,
    PALETTE,
    RESIZE,
    without,
} from "../__fixtures__/catalogs";
import {
    ancestorsOf,
    Expansion,
    isOpen,
    headsOf,
    isReviewOpen,
    isShownOpen,
    prunedExpansion,
    reviewKeyOf,
} from "./expansion";

describe("headsOf", () => {
    it("lists groups, sources and add-ons in the order the model gives them", () => {
        expect(headsOf(CATALOG).map(({ id, parentId }) => [id, parentId])).toEqual([
            ["folder:/work", undefined],
            [CONFIG_SOURCE.id, "folder:/work"],
            [PALETTE.id, CONFIG_SOURCE.id],
            [RESIZE.id, CONFIG_SOURCE.id],
            [PACKAGES_SOURCE.id, "folder:/work"],
            [ACME.id, PACKAGES_SOURCE.id],
            ["marketplaces", undefined],
            [MARKETPLACE_SOURCE.id, "marketplaces"],
            [MAIL.id, MARKETPLACE_SOURCE.id],
        ]);
    });
});

describe("isOpen", () => {
    const heads = headsOf(CATALOG);
    const head = (id: string) => heads.find((each) => each.id === id)!;

    it.each<{ case: string; id: string; expansion: [string, boolean][]; open: boolean }>([
        { case: "a group by default", id: "folder:/work", expansion: [], open: true },
        { case: "a folder's source by default", id: CONFIG_SOURCE.id, expansion: [], open: true },
        {
            case: "not a marketplace by default, as it can hold many templates",
            id: MARKETPLACE_SOURCE.id,
            expansion: [],
            open: false,
        },
        {
            case: "a marketplace the user opened",
            id: MARKETPLACE_SOURCE.id,
            expansion: [[MARKETPLACE_SOURCE.id, true]],
            open: true,
        },
        {
            case: "not a group the user closed",
            id: "folder:/work",
            expansion: [["folder:/work", false]],
            open: false,
        },
        {
            case: "never a row, which holds no heads",
            id: RESIZE.id,
            expansion: [[RESIZE.id, true]],
            open: false,
        },
    ])("$case", ({ id, expansion, open }) => {
        expect(isOpen(head(id), new Map(expansion))).toBe(open);
    });
});

describe("isShownOpen", () => {
    const heads = headsOf(CATALOG);
    const head = (id: string) => heads.find((each) => each.id === id)!;
    const NONE: Expansion = new Map();

    it.each<{
        case: string;
        id: string;
        expansion: Expansion;
        filterExpansion: Expansion;
        filterActive: boolean;
        open: boolean;
    }>([
        {
            case: "follows the default without a filter",
            id: MARKETPLACE_SOURCE.id,
            expansion: NONE,
            filterExpansion: NONE,
            filterActive: false,
            open: false,
        },
        {
            case: "shows a head with matches open while a filter is on",
            id: MARKETPLACE_SOURCE.id,
            expansion: NONE,
            filterExpansion: NONE,
            filterActive: true,
            open: true,
        },
        {
            case: "follows a head the user opened without a filter",
            id: MARKETPLACE_SOURCE.id,
            expansion: new Map([[MARKETPLACE_SOURCE.id, true]]),
            filterExpansion: NONE,
            filterActive: false,
            open: true,
        },
        {
            case: "keeps a head the user opened open while a filter is on",
            id: MARKETPLACE_SOURCE.id,
            expansion: new Map([[MARKETPLACE_SOURCE.id, true]]),
            filterExpansion: NONE,
            filterActive: true,
            open: true,
        },
        {
            case: "follows a head the user closed without a filter",
            id: CONFIG_SOURCE.id,
            expansion: new Map([[CONFIG_SOURCE.id, false]]),
            filterExpansion: NONE,
            filterActive: false,
            open: false,
        },
        {
            case: "shows a head the user closed open while a filter is on, so no match hides",
            id: CONFIG_SOURCE.id,
            expansion: new Map([[CONFIG_SOURCE.id, false]]),
            filterExpansion: NONE,
            filterActive: true,
            open: true,
        },
        {
            case: "ignores a head closed while filtering once no filter is on",
            id: CONFIG_SOURCE.id,
            expansion: NONE,
            filterExpansion: new Map([[CONFIG_SOURCE.id, false]]),
            filterActive: false,
            open: true,
        },
        {
            case: "closes a head the user closed while a filter is on",
            id: CONFIG_SOURCE.id,
            expansion: NONE,
            filterExpansion: new Map([[CONFIG_SOURCE.id, false]]),
            filterActive: true,
            open: false,
        },
        {
            case: "opens a head the user opened while a filter is on over their closed choice",
            id: "folder:/work",
            expansion: new Map([["folder:/work", false]]),
            filterExpansion: new Map([["folder:/work", true]]),
            filterActive: true,
            open: true,
        },
        {
            case: "never opens a row, filter or not",
            id: RESIZE.id,
            expansion: NONE,
            filterExpansion: NONE,
            filterActive: true,
            open: false,
        },
    ])("$case", ({ id, expansion, filterExpansion, filterActive, open }) => {
        expect(isShownOpen(head(id), { expansion, filterExpansion, filterActive })).toBe(open);
    });
});

describe("ancestorsOf", () => {
    const heads = headsOf(CATALOG);

    it.each([
        { id: MAIL.id, ancestors: ["marketplaces", MARKETPLACE_SOURCE.id] },
        { id: CONFIG_SOURCE.id, ancestors: ["folder:/work"] },
        { id: "folder:/work", ancestors: [] },
        { id: "unknown", ancestors: [] },
    ])("names the heads above $id, outermost first", ({ id, ancestors }) => {
        expect(ancestorsOf(heads, id)).toEqual(ancestors);
    });
});

describe("the review disclosure", () => {
    it.each<{ case: string; expansion: Expansion; open: boolean }>([
        { case: "is open by default", expansion: new Map(), open: true },
        {
            case: "stays closed once closed",
            expansion: new Map([[reviewKeyOf(RESIZE.id), false]]),
            open: false,
        },
        {
            case: "does not follow its row's own key",
            expansion: new Map([[RESIZE.id, false]]),
            open: true,
        },
    ])("$case", ({ expansion, open }) => {
        expect(isReviewOpen(RESIZE.id, expansion)).toBe(open);
    });
});

describe("prunedExpansion", () => {
    it("keeps the choices about heads and reviews the model still has, and drops the rest", () => {
        const expansion: Expansion = new Map([
            ["folder:/work", false],
            ["folder:/gone", true],
            [reviewKeyOf(RESIZE.id), false],
            [reviewKeyOf(PALETTE.id), false],
        ]);

        expect([...prunedExpansion(without(ACME.id), expansion)]).toEqual([
            ["folder:/work", false],
            [reviewKeyOf(RESIZE.id), false],
        ]);
    });
});
