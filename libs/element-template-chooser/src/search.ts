/**
 * Ranked fuzzy search over element templates for the chooser overlay.
 *
 * The old chooser filtered with a single whole-query substring test over a
 * space-joined name/description/category/keywords string. That missed typos
 * ("resources" vs the German "Resourcen"), was sensitive to word order and
 * adjacency, and let one field's tail match the next field's head across the
 * join. This module replaces it with MiniSearch: per-term AND matching, typo
 * tolerance, prefix matching, and field-boosted relevance ranking.
 */
import MiniSearch from "minisearch";
import type { ElementTemplate } from "./types";

/**
 * Lowercases and strips diacritics so a query like "resources" matches the
 * German corpus term "Resourcen" and "prufung" matches "Prüfung".
 *
 * MiniSearch applies `processTerm` at both index and search time, so query
 * terms fold identically to indexed terms. Overriding `processTerm` replaces
 * MiniSearch's default lowercasing, so we must lowercase here explicitly.
 */
function normalizeTerm(term: string): string {
    return term
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
}

/**
 * Builds a searchable index over a fixed set of templates.
 *
 * Constructed once per template set (the chooser memoizes it) and queried on
 * every keystroke. Ranking, typo tolerance, and prefix matching are configured
 * here; category-chip filtering stays in the component because it is UI state,
 * not a text-relevance concern.
 */
export class TemplateSearchIndex {
    private readonly index: MiniSearch;

    /**
     * Original templates keyed by their array index, which is also the
     * MiniSearch document id. MiniSearch returns only stored fields, so we map
     * results back to the caller's objects to preserve reference identity that
     * the component relies on (selection, keyboard focus).
     */
    private readonly templates: ElementTemplate[];

    constructor(templates: ElementTemplate[]) {
        this.templates = templates;
        this.index = new MiniSearch({
            // Flat, pre-mapped fields: MiniSearch cannot index nested objects
            // (category.name) or arrays (keywords[]) directly.
            fields: ["name", "keywords", "category", "description"],
            processTerm: normalizeTerm,
            searchOptions: {
                combineWith: "AND", // every term must match; order-independent
                fuzzy: 0.2, // "resources" → "resourcen" (edit distance 1)
                prefix: true, // "daten" → "Datenquelle"
                boost: { name: 5, keywords: 3, category: 2, description: 1 },
            },
        });
        // Array index as document id: template ids are not guaranteed unique
        // (MiniSearch throws on duplicate ids) and the index gives O(1) mapping
        // back to the original object.
        this.index.addAll(
            templates.map((template, i) => ({
                id: i,
                name: template.name,
                keywords: template.keywords?.join(" ") ?? "",
                category: template.category?.name ?? "",
                description: template.description ?? "",
            })),
        );
    }

    /**
     * Returns templates ranked by relevance for the query.
     *
     * An empty or whitespace-only query returns all templates in their original
     * authored order, preserving the chooser's default (unsearched) behavior.
     */
    search(query: string): ElementTemplate[] {
        if (!query.trim()) {
            return this.templates;
        }
        return this.index.search(query).map((result) => this.templates[result.id as number]);
    }
}
