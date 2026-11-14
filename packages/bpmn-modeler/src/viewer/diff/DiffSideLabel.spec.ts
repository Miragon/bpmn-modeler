import { afterEach, describe, expect, it } from "vitest";

import { i18n } from "@miragon/bpmn-modeler-i18n";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";

import { DiffSideLabel } from "./DiffSideLabel";

// The shared DiffSideLabelView's spec covers the label; this one covers the published API's wiring.

afterEach(() => {
    document.body.innerHTML = "";
    i18n.setLanguage("en");
});

describe("DiffSideLabel", () => {
    it("speaks the shared translator's language and names a file on request", () => {
        i18n.extend(extras);
        const parent = document.createElement("div");
        const label = new DiffSideLabel(parent, "after");
        const text = () => parent.querySelector(".diff-side-label")?.textContent;

        i18n.setLanguage("de");
        const german = text();
        label.showFilename("order.bpmn");

        expect(german).toBe("Neue Version");
        expect(text()).toBe("order.bpmn");
    });
});
