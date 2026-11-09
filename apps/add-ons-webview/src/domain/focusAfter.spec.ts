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
    ActionKindPayload,
    focusAfterDone,
    FocusTarget,
    isFocusable,
    neighbourAfterRemoval,
} from "./focusAfter";
import { Expansion, visibleHeadsOf } from "./outline";

describe("focusAfterDone", () => {
    it.each<{ case: string; action: ActionKindPayload; target: FocusTarget }>([
        {
            case: "an allow returns to the row, never to the button that replaced Allow",
            action: "allow",
            target: { kind: "head", headId: "row" },
        },
        {
            case: "a revoke or forget returns to the row",
            action: "revoke",
            target: { kind: "head", headId: "row" },
        },
        {
            case: "a read goes to the review it offers",
            action: "inspect",
            target: { kind: "review", addOnId: "row" },
        },
        {
            case: "an enable stays on the switch that takes its place",
            action: "enable",
            target: { kind: "action", targetId: "row", slot: 1 },
        },
        {
            case: "a disable stays on the switch that takes its place",
            action: "disable",
            target: { kind: "action", targetId: "row", slot: 1 },
        },
        {
            case: "a source switch stays in its place",
            action: "enableTemplates",
            target: { kind: "action", targetId: "row", slot: 1 },
        },
        {
            case: "a source switch off stays in its place",
            action: "disableTemplates",
            target: { kind: "action", targetId: "row", slot: 1 },
        },
        {
            case: "a removed marketplace leaves the slot to its neighbour",
            action: "removeMarketplace",
            target: { kind: "action", targetId: "row", slot: 1 },
        },
        {
            case: "a catalog action stays on its button",
            action: "pruneCache",
            target: { kind: "toolbar", actionKind: "pruneCache" },
        },
        {
            case: "adding a marketplace stays on its button",
            action: "addMarketplace",
            target: { kind: "toolbar", actionKind: "addMarketplace" },
        },
        {
            case: "updating marketplaces stays on its button",
            action: "updateMarketplaces",
            target: { kind: "toolbar", actionKind: "updateMarketplaces" },
        },
    ])("$case", ({ action, target }) => {
        expect(focusAfterDone(action, "row", 1)).toEqual(target);
    });
});

describe("neighbourAfterRemoval", () => {
    const before = visibleHeadsOf(CATALOG, new Map());

    it.each<{ case: string; removed: string; next: typeof CATALOG; neighbour: string | undefined }>(
        [
            {
                case: "the next sibling",
                removed: PALETTE.id,
                next: without(PALETTE.id),
                neighbour: RESIZE.id,
            },
            {
                case: "the previous sibling when it was the last",
                removed: RESIZE.id,
                next: without(RESIZE.id),
                neighbour: PALETTE.id,
            },
            {
                case: "the parent when it was the only child",
                removed: ACME.id,
                next: without(ACME.id),
                neighbour: PACKAGES_SOURCE.id,
            },
            {
                case: "the first head when its parent went too",
                removed: ACME.id,
                next: {
                    ...CATALOG,
                    groups: [{ ...CATALOG.groups[0], sources: [CONFIG_SOURCE] }, CATALOG.groups[1]],
                },
                neighbour: "folder:/work",
            },
            {
                case: "nothing when no head is left",
                removed: ACME.id,
                next: { ...CATALOG, groups: [] },
                neighbour: undefined,
            },
        ],
    )("is $case", ({ removed, next, neighbour }) => {
        expect(neighbourAfterRemoval(removed, before, visibleHeadsOf(next, new Map()))).toBe(
            neighbour,
        );
    });
});

describe("neighbourAfterRemoval between two siblings", () => {
    it("prefers the next sibling over the previous one", () => {
        const LASSO = { ...PALETTE, id: "plugin:/work/.camunda/plugins/lasso", name: "Lasso" };
        const three = {
            ...CATALOG,
            groups: [
                {
                    ...CATALOG.groups[0],
                    sources: [{ ...CONFIG_SOURCE, addOns: [PALETTE, RESIZE, LASSO] }],
                },
            ],
        };

        expect(
            neighbourAfterRemoval(
                RESIZE.id,
                visibleHeadsOf(three, new Map()),
                visibleHeadsOf(without(RESIZE.id, three), new Map()),
            ),
        ).toBe(LASSO.id);
    });
});

describe("isFocusable", () => {
    it.each<{ case: string; target: FocusTarget; expansion?: Expansion; focusable: boolean }>([
        { case: "a shown head", target: { kind: "head", headId: RESIZE.id }, focusable: true },
        {
            case: "not a head under a closed one",
            target: { kind: "head", headId: MAIL.id },
            focusable: false,
        },
        {
            case: "not a head the model lost",
            target: { kind: "head", headId: "plugin:/gone" },
            focusable: false,
        },
        { case: "a row's review", target: { kind: "review", addOnId: RESIZE.id }, focusable: true },
        {
            case: "not a review the row does not offer yet",
            target: { kind: "review", addOnId: ACME.id },
            focusable: false,
        },
        {
            case: "a source's action in its slot",
            target: { kind: "action", targetId: MARKETPLACE_SOURCE.id, slot: 1 },
            focusable: true,
        },
        {
            case: "not a slot beyond the actions",
            target: { kind: "action", targetId: PALETTE.id, slot: 1 },
            focusable: false,
        },
        {
            case: "a row's action under an open source",
            target: { kind: "action", targetId: MAIL.id, slot: 0 },
            expansion: new Map([[MARKETPLACE_SOURCE.id, true]]),
            focusable: true,
        },
        {
            case: "a toolbar action the catalog offers",
            target: { kind: "toolbar", actionKind: "pruneCache" },
            focusable: true,
        },
        {
            case: "not a toolbar action it does not offer",
            target: { kind: "toolbar", actionKind: "updateMarketplaces" },
            focusable: false,
        },
    ])("$case", ({ target, expansion = new Map(), focusable }) => {
        expect(isFocusable(target, CATALOG, expansion)).toBe(focusable);
    });
});
