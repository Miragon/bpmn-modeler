import { describe, expect, it } from "vitest";

import { Allowance } from "./allowance";
import { ListedPresence, presenceIdOf } from "./listedCode";

const PLACE = "/repo/.camunda/plugins/resize";
const allowance: Allowance = {
    kind: "plugin",
    host: "",
    origin: { kind: "folder", path: PLACE },
    addOn: "",
};

describe("presenceIdOf", () => {
    it.each<{ case: string; presence: ListedPresence }>([
        {
            case: "found code by its artifact",
            presence: {
                kind: "found",
                artifact: { id: PLACE, name: "Resize", allowance },
                name: "Resize",
            },
        },
        {
            case: "unreadable code by its place",
            presence: { kind: "unreadable", id: PLACE, reason: "broken", allowance, name: "x" },
        },
        { case: "gone code by its place", presence: { kind: "gone", id: PLACE, name: "resize" } },
    ])("names $case", ({ presence }) => {
        expect(presenceIdOf(presence)).toBe(PLACE);
    });
});
