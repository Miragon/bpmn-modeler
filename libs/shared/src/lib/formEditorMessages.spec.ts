import { describe, expect, it } from "vitest";

import { FORM_INVALID_JSON_MESSAGE, FORM_SCHEMA_IMPORT_ERROR_MESSAGE } from "./formEditorMessages";

describe("Form source recovery messages", () => {
    it("explains how to recover invalid JSON", () => {
        expect(FORM_INVALID_JSON_MESSAGE).toBe(
            "The form contains invalid JSON. Open the raw JSON editor to fix it.",
        );
    });

    it("explains how to recover a schema import failure", () => {
        expect(FORM_SCHEMA_IMPORT_ERROR_MESSAGE).toBe(
            "The form schema could not be loaded. Open the raw JSON editor to fix it.",
        );
    });
});
