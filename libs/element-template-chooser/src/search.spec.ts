import { describe, it, expect } from "vitest";
import { TemplateSearchIndex } from "./search";
import type { ElementTemplate } from "./types";

/**
 * Minimal template factory: fills the required `appliesTo`/`properties` fields
 * so each fixture can focus on the searchable text under test.
 */
function template(
    partial: Partial<ElementTemplate> & Pick<ElementTemplate, "id" | "name">,
): ElementTemplate {
    return {
        appliesTo: ["bpmn:ServiceTask"],
        properties: [],
        ...partial,
    };
}

// The issue's repro template: "resources" is edit-distance 1 from "Resourcen".
const repro = template({
    id: "ds-1",
    name: "Datenquelle - Resourcen laden",
    description: "Lädt Daten aus der Quelle",
    category: { id: "cat-ds", name: "Datenquellen" },
    keywords: ["database", "load"],
});

// Same word ("Zahlung") in the name → must outrank the description-only hit.
const zahlungName = template({
    id: "z-1",
    name: "Zahlung ausführen",
    description: "Startet einen Vorgang",
    category: { id: "cat-pay", name: "Zahlungen" },
});

// "Zahlung" appears only in the description; "Sonstiges" only in the category.
const zahlungDesc = template({
    id: "z-2",
    name: "Generischer Task",
    description: "Verarbeitet eine Zahlung im Hintergrund",
    category: { id: "cat-misc", name: "Sonstiges" },
});

// Umlaut name with every optional field absent.
const pruefung = template({ id: "u-1", name: "Prüfung" });

// Old joined-haystack code matched a query spanning the name→description gap.
const adjacency = template({ id: "adj-1", name: "Alpha", description: "Bravo" });

// Two templates sharing an id: the index must key on array position instead.
const dupA = template({ id: "dup", name: "First Duplicate" });
const dupB = template({ id: "dup", name: "Second Duplicate" });

const templates: ElementTemplate[] = [
    repro,
    zahlungName,
    zahlungDesc,
    pruefung,
    adjacency,
    dupA,
    dupB,
];

const index = new TemplateSearchIndex(templates);

describe("TemplateSearchIndex", () => {
    it("finds a template despite a single-character typo (issue #1231 repro)", () => {
        expect(index.search("resources")).toContain(repro);
    });

    it("matches multi-word queries regardless of order", () => {
        expect(index.search("laden resourcen")).toContain(repro);
    });

    it("matches on a prefix of an indexed term", () => {
        expect(index.search("daten")).toContain(repro);
    });

    it("requires every term to match (AND semantics)", () => {
        expect(index.search("resourcen zzzz")).toEqual([]);
    });

    it("searches the keywords field", () => {
        expect(index.search("database")).toContain(repro);
    });

    it("searches the category-name field", () => {
        // "sonstiges" appears only as zahlungDesc's category name.
        expect(index.search("sonstiges")).toEqual([zahlungDesc]);
    });

    it("ranks a name match above a description-only match", () => {
        const results = index.search("zahlung");
        expect(results.indexOf(zahlungName)).toBeLessThan(results.indexOf(zahlungDesc));
    });

    it("returns all templates in original order for an empty or whitespace query", () => {
        expect(index.search("")).toBe(templates);
        expect(index.search("   ")).toBe(templates);
    });

    it("does not match a substring spanning two fields (old joined-haystack bug)", () => {
        // "pha bra" spans the end of "Alpha" and the start of "Bravo"; the old
        // `haystack.includes(q)` matched it, per-field search must not.
        expect(index.search("pha bra")).toEqual([]);
    });

    it("folds diacritics so an ASCII query matches an umlaut term", () => {
        expect(index.search("prufung")).toContain(pruefung);
    });

    it("does not throw when optional fields are absent", () => {
        expect(() => index.search("prüfung")).not.toThrow();
        expect(index.search("prüfung")).toContain(pruefung);
    });

    it("indexes templates that share an id without throwing", () => {
        const results = index.search("duplicate");
        expect(results).toContain(dupA);
        expect(results).toContain(dupB);
    });

    it("returns the caller's original template objects (reference identity)", () => {
        const [result] = index.search("resources");
        expect(result).toBe(repro);
    });
});
