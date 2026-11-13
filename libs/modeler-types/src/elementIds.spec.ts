import { describe, expect, it } from "vitest";

import {
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
