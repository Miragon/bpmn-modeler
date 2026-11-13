import { describe, expect, it } from "vitest";

import { ImportedFormDocument } from "./importedFormDocument";

const SOURCE = '{ "components": [], "id": "Form_1" }';
const BASELINE = '{\n  "components": [],\n  "id": "Form_1",\n  "schemaVersion": 19\n}';

describe("ImportedFormDocument", () => {
    it("answers the host's own text while the schema still equals the imported one", () => {
        const imported = new ImportedFormDocument(SOURCE, BASELINE);

        expect(imported.contentFor(BASELINE)).toBe(SOURCE);
    });

    it("answers the serialized schema once an edit changed it", () => {
        const imported = new ImportedFormDocument(SOURCE, BASELINE);
        const edited = BASELINE.replace("Form_1", "Form_2");

        expect(imported.contentFor(edited)).toBe(edited);
    });
});
