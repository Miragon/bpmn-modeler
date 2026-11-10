import { FormEditor } from "@bpmn-io/form-js-editor";
import { Form } from "@bpmn-io/form-js-viewer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { numericValidationModule } from "./numericValidationModule";

// Preact effects can outlive a test, so these jsdom observer stubs stay installed.
class NoopObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
}
vi.stubGlobal("IntersectionObserver", NoopObserver);
vi.stubGlobal("ResizeObserver", NoopObserver);

type SavedField = {
    validate?: Record<string, string | number | boolean>;
    defaultValue?: number;
    decimalDigits?: number;
};

function formWithField(field: Record<string, unknown>) {
    return {
        type: "default",
        id: "Form_1",
        components: [{ id: "Field_1", key: "value", label: "Value", ...field }],
    };
}

beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
});

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
});

describe("numeric validation module with the real form-js editor", () => {
    it("keeps original numeric undo snapshots and redoes normalized validation without mutating edit values", async () => {
        const editor = new FormEditor({
            container: document.getElementById("app")!,
            additionalModules: [numericValidationModule],
        });
        try {
            await editor.importSchema(
                formWithField({
                    type: "number",
                    defaultValue: 1.5,
                    decimalDigits: 2,
                    validate: { min: 0, max: 10, required: true },
                }),
            );
            const field = editor
                .get<{ get(id: string): SavedField }>("formFieldRegistry")
                .get("Field_1");
            const original = field.validate;
            const edited = Object.freeze({ ...original, max: 20 });
            const modeling = editor.get<{
                editFormField(field: SavedField, properties: Record<string, unknown>): void;
            }>("modeling");
            const commandStack = editor.get<{ undo(): void; redo(): void }>("commandStack");

            modeling.editFormField(field, { validate: edited });

            expect(field.validate).toEqual({ min: "0", max: "20", required: true });
            expect(field.validate).not.toBe(edited);
            expect(edited).toEqual({ min: 0, max: 20, required: true });
            commandStack.undo();
            expect(field.validate).toBe(original);
            expect(field.validate).toEqual({ min: 0, max: 10, required: true });
            commandStack.redo();
            expect(field.validate).toEqual({ min: "0", max: "20", required: true });
            expect(original).toEqual({ min: 0, max: 10, required: true });
            expect(field.defaultValue).toBe(1.5);
            expect(field.decimalDigits).toBe(2);
        } finally {
            editor.destroy();
        }
    });

    it("leaves validation untouched for unrelated edits and supports removing the validation object", async () => {
        const editor = new FormEditor({
            container: document.getElementById("app")!,
            additionalModules: [numericValidationModule],
        });
        try {
            await editor.importSchema(
                formWithField({ type: "number", validate: { min: 0, max: 10 } }),
            );
            const field = editor
                .get<{ get(id: string): SavedField }>("formFieldRegistry")
                .get("Field_1");
            const original = field.validate;
            const modeling = editor.get<{
                editFormField(field: SavedField, properties: Record<string, unknown>): void;
            }>("modeling");

            modeling.editFormField(field, { label: "Renamed", defaultValue: 2.5 });
            expect(field.validate).toBe(original);
            expect(field.validate).toEqual({ min: 0, max: 10 });
            expect(field.defaultValue).toBe(2.5);

            modeling.editFormField(field, { validate: undefined });
            expect(field.validate).toBeUndefined();
            expect(original).toEqual({ min: 0, max: 10 });
        } finally {
            editor.destroy();
        }
    });

    it.each([undefined, null, false, "", 0, []])(
        "leaves absent or non-object validation unchanged at the edit boundary: %s",
        (validation) => {
            const Service = numericValidationModule.numericValidationEditing[1];
            if (typeof Service !== "function") {
                throw new Error("Expected a numeric validation service constructor");
            }
            const context = { properties: { validate: validation } };
            const handlers: Array<() => void> = [];
            new Service({
                on(event, handler) {
                    expect(event).toBe("commandStack.formField.edit.preExecute");
                    handlers.push(() => handler({ context }));
                },
            });

            expect(handlers).toHaveLength(1);
            handlers[0]();

            expect(context.properties.validate).toBe(validation);
        },
    );
});

// The adapter relies on form-js accepting string bounds without stringifying submission data.
describe("form-js 2.1.1 string-bound characterization", () => {
    it.each([
        [-1, true],
        [0, false],
        [5.5, false],
        [10, false],
        [11, true],
    ])("enforces string bounds without converting submitted number %s", async (value, invalid) => {
        const viewer = new Form({ container: document.getElementById("app")! });
        try {
            await viewer.importSchema(
                formWithField({ type: "number", validate: { min: "0", max: "10" } }),
                { value },
            );
            await vi.waitFor(() => expect(document.querySelector("input")).not.toBeNull());

            const result = viewer.submit();

            expect(result.data).toEqual({ value });
            if (invalid) {
                expect(result.errors).toHaveProperty("Field_1");
            } else {
                expect(result.errors).toEqual({});
            }
        } finally {
            viewer.destroy();
        }
    });
});
