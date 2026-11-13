import { describe, expect, it } from "vitest";

import type { AddOnDetailTarget } from "@miragon/bpmn-modeler-core";
import { VsCodeAddOnDetail } from "./VsCodeAddOnDetail";

const TARGET: AddOnDetailTarget = { addOnId: "plugin:/work/x", title: "Add-on: X" };

describe("VsCodeAddOnDetail", () => {
    it("shows the details in the tab it is connected to", () => {
        const shown: AddOnDetailTarget[] = [];
        const detail = new VsCodeAddOnDetail();
        detail.connect({ show: (target) => shown.push(target) });

        detail.open(TARGET);

        expect(shown).toEqual([TARGET]);
    });

    it("opens nothing before the tab is connected", () => {
        expect(() => new VsCodeAddOnDetail().open(TARGET)).not.toThrow();
    });
});
