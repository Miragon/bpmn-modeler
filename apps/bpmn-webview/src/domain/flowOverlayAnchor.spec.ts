import { describe, expect, it } from "vitest";

import { flowOverlayAnchor } from "./flowOverlayAnchor";

describe("flowOverlayAnchor", () => {
    it("is the top left corner of the box around the flow's waypoints", () => {
        expect(
            flowOverlayAnchor([
                { x: 300, y: 120 },
                { x: 300, y: 40 },
                { x: 80, y: 40 },
                { x: 80, y: 200 },
            ]),
        ).toStrictEqual({ x: 80, y: 40 });
    });
});
