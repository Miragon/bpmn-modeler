import { describe, expect, it } from "vitest";

import { ADD_ONS_PAGE_ATTRIBUTE, addOnsPageAttributes, addOnsPageOf } from "./addOnsPage";

describe("addOnsPageOf", () => {
    it.each([
        { written: "list", page: "list" },
        { written: "listWithTab", page: "listWithTab" },
        { written: "detail", page: "detail" },
        { written: undefined, page: "list" },
        { written: "elsewhere", page: "list" },
    ])("reads $written as $page", ({ written, page }) => {
        expect(addOnsPageOf(written)).toBe(page);
    });
});

describe("addOnsPageAttributes", () => {
    it("writes the page kind a host serves into one attribute", () => {
        expect(addOnsPageAttributes("detail")).toEqual({ [ADD_ONS_PAGE_ATTRIBUTE]: "detail" });
    });
});
