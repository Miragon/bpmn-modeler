import { describe, expect, it } from "vitest";

import {
    type CompareFormat,
    nothingSelectedForCompareText,
    selectedForCompareText,
    selectTwoFilesText,
} from "./compareTexts";

const BPMN: CompareFormat = { extension: ".bpmn", label: "BPMN" };
const DMN: CompareFormat = { extension: ".dmn", label: "DMN" };

describe("compare texts", () => {
    it("names the file picked for compare", () => {
        expect(selectedForCompareText("shipping.dmn")).toBe(
            "BPMN Modeler: shipping.dmn selected for compare",
        );
    });

    it.each([
        [
            BPMN,
            'No file selected for compare. Right-click a .bpmn file and choose "Select for Compare (BPMN)" first.',
            "Select exactly two .bpmn files to compare.",
        ],
        [
            DMN,
            'No file selected for compare. Right-click a .dmn file and choose "Select for Compare (DMN)" first.',
            "Select exactly two .dmn files to compare.",
        ],
    ])("names the %o file format and its menu entry", (format, nothingSelected, selectTwo) => {
        expect(nothingSelectedForCompareText(format)).toBe(nothingSelected);
        expect(selectTwoFilesText(format)).toBe(selectTwo);
    });
});
