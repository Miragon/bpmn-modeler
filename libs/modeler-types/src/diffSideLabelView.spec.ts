import { afterEach, describe, expect, it } from "vitest";

import type { DiffLegendTranslator } from "./diffLegendView";
import { DiffSideLabelView } from "./diffSideLabelView";

class GermanOnDemand implements DiffLegendTranslator {
    private german = false;
    private readonly listeners = new Set<() => void>();

    translate(key: string): string {
        return this.german && key === "New version" ? "Neue Version" : key;
    }

    onChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    speakGerman(): void {
        this.german = true;
        this.listeners.forEach((listener) => listener());
    }

    get listenerCount(): number {
        return this.listeners.size;
    }
}

let translator: GermanOnDemand;

function mount(side: "before" | "after") {
    const parent = document.createElement("div");
    document.body.append(parent);
    translator = new GermanOnDemand();
    const label = new DiffSideLabelView(parent, side, translator);
    return { parent, label, text: () => label.element.textContent };
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("DiffSideLabelView", () => {
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

    it("says when the pane's version lacks the plane its partner entered", () => {
        const { label, text } = mount("before");

        label.showPlaneMissing(true);
        const missing = text();
        label.showPlaneMissing(false);

        expect(missing).toBe("Old version · Not in this version");
        expect(text()).toBe("Old version");
    });

    it("speaks the user's language when it changes", () => {
        const { text } = mount("after");

        translator.speakGerman();

        expect(text()).toBe("Neue Version");
    });

    it("goes away and stops listening for language changes when destroyed", () => {
        const { label, parent } = mount("after");

        label.destroy();

        expect(parent.querySelector(".diff-side-label")).toBeNull();
        expect(translator.listenerCount).toBe(0);
    });
});
