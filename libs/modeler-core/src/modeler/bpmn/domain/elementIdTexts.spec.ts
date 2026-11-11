import { describe, expect, it } from "vitest";

import type { ElementIdReviewStatus } from "@miragon/bpmn-modeler-types";

import { elementIdReviewNotice, SWITCH_MODE_TO_GENERATE_IDS } from "./elementIdTexts";

describe("elementIdReviewNotice", () => {
    it.each<{ status: ElementIdReviewStatus; notice: string | undefined }>([
        { status: "unsupported", notice: SWITCH_MODE_TO_GENERATE_IDS },
        { status: "opened", notice: undefined },
        // A newer webview can send a status this core has no words for.
        { status: "renamed" as ElementIdReviewStatus, notice: undefined },
        { status: "toString" as ElementIdReviewStatus, notice: undefined },
    ])("answers a $status review with $notice", ({ status, notice }) => {
        expect(elementIdReviewNotice(status)).toBe(notice);
    });

    it("names the modes that can change IDs", () => {
        expect(SWITCH_MODE_TO_GENERATE_IDS).toBe(
            "Switch to Design or Implement mode to generate IDs from names.",
        );
    });
});
