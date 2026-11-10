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
import type { ActionKindPayload } from "./actionRequest";
import {
    focusAfterDone,
    FocusTarget,
    isFocusable,
    isListed,
    isRequestedByHost,
} from "./focusAfter";

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

describe("isFocusable", () => {
    it.each<{ case: string; target: FocusTarget; focusable: boolean }>([
        { case: "a listed row", target: { kind: "head", headId: RESIZE.id }, focusable: true },
        {
            case: "a row in a closed source, as its detail can take focus",
            target: { kind: "head", headId: MAIL.id },
            focusable: true,
        },
        {
            case: "a source's header",
            target: { kind: "head", headId: CONFIG_SOURCE.id },
            focusable: true,
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
            case: "not the review of a row the model lost",
            target: { kind: "review", addOnId: "plugin:/gone" },
            focusable: false,
        },
        {
            case: "a source's action in its slot",
            target: { kind: "action", targetId: MARKETPLACE_SOURCE.id, slot: 1 },
            focusable: true,
        },
        {
            case: "a row's action in its slot",
            target: { kind: "action", targetId: MAIL.id, slot: 0 },
            focusable: true,
        },
        {
            case: "not a slot beyond the actions",
            target: { kind: "action", targetId: PALETTE.id, slot: 1 },
            focusable: false,
        },
        {
            case: "not an action of a target the model lost",
            target: { kind: "action", targetId: "marketplace:gone", slot: 0 },
            focusable: false,
        },
        {
            case: "a catalog action the catalog offers",
            target: { kind: "toolbar", actionKind: "pruneCache" },
            focusable: true,
        },
        {
            case: "not a catalog action it does not offer",
            target: { kind: "toolbar", actionKind: "updateMarketplaces" },
            focusable: false,
        },
        {
            case: "the list's start, which always has a place",
            target: { kind: "listStart" },
            focusable: true,
        },
    ])("$case", ({ target, focusable }) => {
        expect(isFocusable(target, CATALOG)).toBe(focusable);
    });
});

describe("isListed", () => {
    it.each([
        ["folder:/work", true],
        [PACKAGES_SOURCE.id, true],
        [RESIZE.id, true],
        [RESIZE.id, false, without(RESIZE.id)],
    ] as const)("finds %s: %s", (id, listed, model = CATALOG) => {
        expect(isListed(model, id)).toBe(listed);
    });
});

describe("isRequestedByHost", () => {
    it.each<{ case: string; target: FocusTarget | undefined; requested: boolean }>([
        { case: "no target", target: undefined, requested: false },
        {
            case: "a row after an action",
            target: { kind: "head", headId: "row" },
            requested: false,
        },
        {
            case: "the list's start after a render",
            target: { kind: "listStart" },
            requested: false,
        },
        { case: "a review", target: { kind: "review", addOnId: "row" }, requested: false },
        {
            case: "a row a Review… revealed",
            target: { kind: "head", headId: "row", reveal: true },
            requested: true,
        },
        {
            case: "the row Review Add-ons selected",
            target: { kind: "head", headId: "row", requested: true },
            requested: true,
        },
        {
            case: "the list's start Review Add-ons found empty",
            target: { kind: "listStart", requested: true },
            requested: true,
        },
    ])("takes $case as requested by the host: $requested", ({ target, requested }) => {
        expect(isRequestedByHost(target)).toBe(requested);
    });
});
