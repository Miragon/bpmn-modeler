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
    isReviewOpen,
    outlineHeadsOf,
    prunedExpansion,
    reviewKeyOf,
    visibleHeadsOf,
} from "./outline";

const ids = (heads: readonly { id: string }[]) => heads.map(({ id }) => id);

describe("outlineHeadsOf", () => {
    it("lists groups, sources and add-ons in the order the model gives them", () => {
        expect(
            outlineHeadsOf(CATALOG).map(({ id, level, name, parentId }) => [
                id,
                level,
                name,
                parentId,
            ]),
        ).toEqual([
            ["folder:/work", "group", "work", undefined],
            [CONFIG_SOURCE.id, "source", ".camunda", "folder:/work"],
            [PALETTE.id, "addOn", "Palette", CONFIG_SOURCE.id],
            [RESIZE.id, "addOn", "Resize Tasks", CONFIG_SOURCE.id],
            [PACKAGES_SOURCE.id, "source", "node_modules", "folder:/work"],
            [ACME.id, "addOn", "bpmnlint-plugin-acme", PACKAGES_SOURCE.id],
            ["marketplaces", "group", "Marketplaces", undefined],
            [MARKETPLACE_SOURCE.id, "source", "/shared", "marketplaces"],
            [MAIL.id, "addOn", "Mail", MARKETPLACE_SOURCE.id],
        ]);
    });
});

describe("isOpen", () => {
    const heads = outlineHeadsOf(CATALOG);
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

describe("visibleHeadsOf", () => {
    it("hides the heads below a closed one, a marketplace's templates by default", () => {
        expect(ids(visibleHeadsOf(CATALOG, new Map()))).toEqual([
            "folder:/work",
            CONFIG_SOURCE.id,
            PALETTE.id,
            RESIZE.id,
            PACKAGES_SOURCE.id,
            ACME.id,
            "marketplaces",
            MARKETPLACE_SOURCE.id,
        ]);
    });

    it("hides every head below a closed group, the open sources' rows included", () => {
        expect(ids(visibleHeadsOf(CATALOG, new Map([["folder:/work", false]])))).toEqual([
            "folder:/work",
            "marketplaces",
            MARKETPLACE_SOURCE.id,
        ]);
    });
});

describe("ancestorsOf", () => {
    const heads = outlineHeadsOf(CATALOG);

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
