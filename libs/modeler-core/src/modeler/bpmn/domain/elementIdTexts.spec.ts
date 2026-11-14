import { describe, expect, it } from "vitest";

import { ELEMENT_ID_REVIEW_UNAVAILABLE, SWITCH_MODE_TO_GENERATE_IDS } from "./elementIdTexts";

describe("element ID texts", () => {
    it("names the modes that can change IDs", () => {
        expect(SWITCH_MODE_TO_GENERATE_IDS).toBe(
            "Switch to Design or Implement mode to generate IDs from names.",
        );
    });

    it("points a host without a review panel to the link under the ID field", () => {
        expect(ELEMENT_ID_REVIEW_UNAVAILABLE).toBe(
            "This editor cannot show the review of IDs generated from names. Use Generate from name under an element's ID.",
        );
    });
});
