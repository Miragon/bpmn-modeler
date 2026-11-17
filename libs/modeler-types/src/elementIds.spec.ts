import { describe, expect, it } from "vitest";

import {
    elementIdSettingsOf,
    EVENT_DEFINITION_QUALIFIER_MODES,
    type EventDefinitionQualifierMode,
    isChangingStatus,
} from "./elementIds";

// The compiler holds these keys to the union; the list is only typed as it.
const EVERY_QUALIFIER_MODE: Record<EventDefinitionQualifierMode, true> = {
    off: true,
    optional: true,
    required: true,
};

describe("EVENT_DEFINITION_QUALIFIER_MODES", () => {
    it("names every qualifier mode once", () => {
        expect([...EVENT_DEFINITION_QUALIFIER_MODES].sort()).toEqual(
            Object.keys(EVERY_QUALIFIER_MODE).sort(),
        );
    });
});

describe("isChangingStatus", () => {
    it("holds for the rows that rename when checked, not for the ones that keep their ID", () => {
        expect(
            (["rename", "unchecked", "matches", "skipped"] as const).map(isChangingStatus),
        ).toEqual([true, true, false, false]);
    });
});

describe("elementIdSettingsOf", () => {
    it.each([
        { name: "on", settings: { elementIdsFollowName: true }, expected: { followName: true } },
        { name: "off", settings: { elementIdsFollowName: false }, expected: { followName: false } },
        { name: "absent", settings: { colorTheme: "light" as const }, expected: {} },
        { name: "no settings", settings: undefined, expected: {} },
    ])("takes follow-name when it is $name", ({ settings, expected }) => {
        expect(elementIdSettingsOf(settings)).toStrictEqual(expected);
    });
});
