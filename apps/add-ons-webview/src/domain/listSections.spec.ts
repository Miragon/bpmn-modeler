import type { AddOnCatalogPayload, AddOnGroupPayload } from "@miragon/bpmn-modeler-shared";
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
} from "../__fixtures__/catalogs";
import { displayOrderOf, needsAttention, sectionsOf } from "./listSections";

const [FOLDER, MARKETPLACES] = CATALOG.groups as [AddOnGroupPayload, AddOnGroupPayload];

const BROKEN = {
    ...PALETTE,
    id: "plugin:/work/.camunda/plugins/broken",
    name: "broken",
    problem: "Cannot be read: no manifest.",
};

const SECOND_FOLDER: AddOnGroupPayload = {
    id: "folder:/other",
    kind: "folder",
    label: "other",
    description: "/other",
    sources: [],
};

function catalogWith(groups: readonly AddOnGroupPayload[]): AddOnCatalogPayload {
    return { ...CATALOG, groups };
}

describe("needsAttention", () => {
    it.each([
        { case: "code that offers Allow", addOn: RESIZE, expected: true },
        { case: "code with a problem", addOn: BROKEN, expected: true },
        { case: "allowed code", addOn: PALETTE, expected: false },
        { case: "an enabled template", addOn: MAIL, expected: false },
    ])("$case: $expected", ({ addOn, expected }) => {
        expect(needsAttention(addOn)).toBe(expected);
    });
});

describe("sectionsOf", () => {
    it("lists what needs attention first, in model order, and leaves it out below", () => {
        const sections = sectionsOf(CATALOG.groups);

        expect(sections.attention.map(({ addOn }) => addOn.id)).toEqual([RESIZE.id, ACME.id]);
        expect(sections.attention[0]?.source).toBe(CONFIG_SOURCE);
        expect(
            sections.installed[0]?.sources.map(({ addOns }) => addOns.map(({ id }) => id)),
        ).toEqual([[PALETTE.id], []]);
    });

    it("keeps a source whose rows all moved up, so its header and actions stay", () => {
        const sources = sectionsOf(CATALOG.groups).installed[0]?.sources;

        expect(sources?.map(({ id }) => id)).toEqual([CONFIG_SOURCE.id, PACKAGES_SOURCE.id]);
        expect(sources?.[1]?.actions).toBe(PACKAGES_SOURCE.actions);
    });

    it("puts the marketplaces group in its own section", () => {
        const sections = sectionsOf(CATALOG.groups);

        expect(sections.installed.map(({ id }) => id)).toEqual([FOLDER.id]);
        expect(sections.marketplaces?.id).toBe(MARKETPLACES.id);
    });

    it.each([
        { case: "lists a marketplace", group: MARKETPLACES, shown: true },
        {
            case: "has a problem only",
            group: { ...MARKETPLACES, sources: [], problem: "Unreadable." },
            shown: true,
        },
        { case: "lists nothing", group: { ...MARKETPLACES, sources: [] }, shown: false },
    ])("shows the marketplaces section when it $case: $shown", ({ group, shown }) => {
        expect(sectionsOf([FOLDER, group]).marketplaces !== undefined).toBe(shown);
    });

    it.each([
        { case: "one folder", groups: [FOLDER, MARKETPLACES], flat: [FOLDER.id] },
        { case: "two folders", groups: [FOLDER, SECOND_FOLDER, MARKETPLACES], flat: [] },
        { case: "no folder", groups: [MARKETPLACES], flat: [] },
    ])("stands the sources of $case directly under Installed: $flat", ({ groups, flat }) => {
        expect([...sectionsOf(groups).flatGroupIds]).toEqual(flat);
    });

    it("takes a marketplace template with a problem into Needs attention", () => {
        const failing = { ...MAIL, problem: "Cannot be read: bad JSON." };
        const groups = catalogWith([
            FOLDER,
            { ...MARKETPLACES, sources: [{ ...MARKETPLACE_SOURCE, addOns: [failing] }] },
        ]).groups;

        expect(sectionsOf(groups).attention.map(({ addOn }) => addOn.id)).toEqual([
            RESIZE.id,
            ACME.id,
            failing.id,
        ]);
    });
});

describe("sectionsOf while a filter is on", () => {
    it("drops a source and a folder the split leaves without a match", () => {
        const filtered: AddOnGroupPayload[] = [
            { ...FOLDER, sources: [{ ...CONFIG_SOURCE, addOns: [RESIZE] }] },
        ];

        expect(sectionsOf(filtered, { filtering: true, all: CATALOG.groups }).installed).toEqual(
            [],
        );
    });

    it("decides a folder's header from every folder, not only the matching ones", () => {
        const all = [FOLDER, SECOND_FOLDER, MARKETPLACES];

        expect([...sectionsOf([FOLDER], { filtering: true, all }).flatGroupIds]).toEqual([]);
    });
});

describe("displayOrderOf", () => {
    it("orders the rows as the list shows them: Needs attention, Installed, Marketplaces", () => {
        expect(displayOrderOf(sectionsOf(CATALOG.groups))).toEqual([
            RESIZE.id,
            ACME.id,
            PALETTE.id,
            MAIL.id,
        ]);
    });
});
