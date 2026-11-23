import { describe, expect, it } from "vitest";

import { EMPTY_DMN_DIAGRAM } from "./emptyDmn";

describe("EMPTY_DMN_DIAGRAM", () => {
    it("starts with the XML declaration", () => {
        expect(EMPTY_DMN_DIAGRAM.split("\n", 1)[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>');
    });

    it("ends with one newline after the root element, as dmn-js exports it", () => {
        expect(EMPTY_DMN_DIAGRAM.endsWith("</definitions>\n")).toBe(true);
    });
});
