import { describe, expect, it } from "vitest";
import { isIdValid } from "./ValidationUtil";

const translate = (template: string) => template;

describe("isIdValid", () => {
    it("tolerates a missing $model.ids registry (readonly viewer, #1443)", () => {
        // bpmn-js creates `moddle.ids` only on modelers; on a NavigatedViewer
        // the uniqueness check must degrade instead of crashing the entry.
        expect(isIdValid({ $model: {} }, "task_1", translate)).toBeUndefined();
    });

    it("still reports duplicates through an existing registry", () => {
        const element = { $model: { ids: { assigned: () => ({}) } } };
        expect(isIdValid(element, "task_1", translate)).toBe("ID must be unique.");
    });

    it("still rejects empty and malformed ids", () => {
        const element = { $model: {} };
        expect(isIdValid(element, "", translate)).toBe("ID must not be empty.");
        expect(isIdValid(element, "has space", translate)).toBe("ID must not contain spaces.");
    });
});
