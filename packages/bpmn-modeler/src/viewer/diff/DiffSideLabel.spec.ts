import { afterEach, describe, expect, it } from "vitest";

import { i18n } from "@miragon/bpmn-modeler-i18n";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";

import { DiffSideLabel } from "./DiffSideLabel";

function mount(side: "before" | "after") {
    const parent = document.createElement("div");
    document.body.append(parent);
    const label = new DiffSideLabel(parent, side);
    const text = () => parent.querySelector(".diff-side-label")?.textContent;
    return { parent, label, text };
}

afterEach(() => {
    document.body.innerHTML = "";
    i18n.setLanguage("en");
});

describe("DiffSideLabel", () => {
    it("names the side its pane shows", () => {
        expect(mount("before").text()).toBe("Old version");
        expect(mount("after").text()).toBe("New version");
    });

    it("names the file instead when the pane compares two files, and the side again without one", () => {
        const { label, text } = mount("before");

        label.showFilename("order.bpmn");
        const withFile = text();
        label.showFilename(undefined);

        expect(withFile).toBe("order.bpmn");
        expect(text()).toBe("Old version");
    });

    it("speaks the shared translator's language", () => {
        i18n.extend(extras);
        const { text } = mount("after");

        i18n.setLanguage("de");

        expect(text()).toBe("Neue Version");
    });

    it("removes itself and stops translating on destroy", () => {
        const { label, parent } = mount("after");

        label.destroy();
        i18n.setLanguage("de");

        expect(parent.querySelector(".diff-side-label")).toBeNull();
    });
});
