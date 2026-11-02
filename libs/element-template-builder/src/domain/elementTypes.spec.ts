import { describe, expect, it } from "vitest";

import { catalogFor } from "../catalog";
import { elementTypeName } from "./elementTypes";

describe("elementTypeName", () => {
    it.each(["c7", "c8"] as const)("names every element type of the %s catalog", (engine) => {
        const unnamed = catalogFor(engine).elementTypes.filter(
            (type) => elementTypeName(type) === type,
        );

        expect(unnamed).toEqual([]);
    });

    it("keeps an identifier it does not know", () => {
        expect(elementTypeName("bpmn:Bogus")).toBe("bpmn:Bogus");
    });
});
