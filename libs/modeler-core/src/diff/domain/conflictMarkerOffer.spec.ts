import { describe, expect, it } from "vitest";

import { shouldOfferMergeView } from "./conflictMarkerOffer";

describe("shouldOfferMergeView", () => {
    it.each<[string, boolean | undefined, boolean, boolean]>([
        ["offers on the first sight of markers", undefined, true, true],
        ["offers nothing for a file opened without markers", undefined, false, false],
        ["does not repeat while the markers stay", true, true, false],
        ["offers again once the markers came back", false, true, true],
        ["offers nothing when the markers left", true, false, false],
        ["offers nothing while the file stays clean", false, false, false],
    ])("%s", (_case, previous, now, expected) => {
        expect(shouldOfferMergeView(previous, now)).toBe(expected);
    });
});
