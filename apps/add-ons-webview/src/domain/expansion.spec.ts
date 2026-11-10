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
    const marketplace = headsOf(CATALOG).find(({ id }) => id === MARKETPLACE_SOURCE.id)!;
    const closedWork = new Map([["folder:/work", false]]);
    const work = headsOf(CATALOG)[0]!;

    it.each<{ case: string; open: boolean; filterActive: boolean; expected: boolean }>([
        {
            case: "follows the user's choice without a filter",
            open: false,
            filterActive: false,
            expected: false,
        },
        {
            case: "shows a closed head open while a filter is active",
            open: false,
            filterActive: true,
            expected: true,
        },
        { case: "keeps an open head open", open: true, filterActive: false, expected: true },
    ])("$case", ({ open, filterActive, expected }) => {
        const expansion = new Map([[MARKETPLACE_SOURCE.id, open]]);

        expect(isShownOpen(marketplace, expansion, filterActive)).toBe(expected);
    });

    it("leaves the stored choice as it was", () => {
        isShownOpen(work, closedWork, true);

        expect([...closedWork]).toEqual([["folder:/work", false]]);
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
