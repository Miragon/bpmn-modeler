import { describe, expect, it } from "vitest";

import { fallbackTranslate } from "./translate";

describe("fallbackTranslate", () => {
    it("resolves known placeholders and keeps unknown ones", () => {
        expect(fallbackTranslate("{count} of {total} properties", { count: "2" })).toBe(
            "2 of {total} properties",
        );
    });

    it("echoes a template without placeholders", () => {
        expect(fallbackTranslate("Apply Template")).toBe("Apply Template");
    });
});
