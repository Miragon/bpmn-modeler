import { describe, expect, it, vi } from "vitest";

import { FormReferenceAvailability } from "./formReferenceAvailability";

describe("FormReferenceAvailability", () => {
    it("knows no form until the host reports one", () => {
        const availability = new FormReferenceAvailability();

        expect(availability.has("Form_1")).toBe(false);

        availability.update(["Form_1"]);

        expect(availability.has("Form_1")).toBe(true);
        expect(availability.has("Form_2")).toBe(false);
    });

    it("reports and notifies only a change in the set of form ids", () => {
        const availability = new FormReferenceAvailability();
        const changed = vi.fn();
        availability.onChanged(changed);

        expect(availability.update(["Form_1", "Form_2"])).toBe(true);
        expect(availability.update(["Form_2", "Form_1"])).toBe(false);
        expect(changed).toHaveBeenCalledOnce();

        expect(availability.update(["Form_1", "Form_3"])).toBe(true);
        expect(changed).toHaveBeenCalledTimes(2);

        expect(availability.update(["Form_1"])).toBe(true);
        expect(changed).toHaveBeenCalledTimes(3);

        expect(availability.update([])).toBe(true);
        expect(availability.update([])).toBe(false);
        expect(changed).toHaveBeenCalledTimes(4);
    });

    it("stops notifying a listener that unsubscribed", () => {
        const availability = new FormReferenceAvailability();
        const kept = vi.fn();
        const dropped = vi.fn();
        availability.onChanged(kept);
        const unsubscribe = availability.onChanged(dropped);

        unsubscribe();
        availability.update(["Form_1"]);

        expect(kept).toHaveBeenCalledOnce();
        expect(dropped).not.toHaveBeenCalled();
    });
});
