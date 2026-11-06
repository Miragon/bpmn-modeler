import { buildImportGraph, readSourceTree, stripComments } from "@miragon/architecture-testing";
import { describe, expect, it } from "vitest";

/**
 * What the repo-level role-folder rules do not read: inside `domain/`, the
 * catalog is the engines' data and the rest the rules over it; the domain
 * names no DOM global; and the panel's Preact and the stylesheet stay in the
 * UI. The page (`apps/bpmn-webview`) only reaches the library through
 * `index.ts`.
 */
const CATALOG = "domain/catalog/";
const DOMAIN = "domain/";
const UI = "adapter/in/";

const tree = readSourceTree(__dirname);
const { edges } = buildImportGraph(tree);

describe("the template builder", () => {
    it("keeps the catalog free of the rules over it", () => {
        const offenders = edges.filter(
            ({ from, to }) =>
                from.startsWith(CATALOG) && to !== undefined && !to.startsWith(CATALOG),
        );

        expect(offenders.map(({ from, to }) => `${from} -> ${to}`)).toEqual([]);
    });

    it("keeps the UI toolkit in the UI", () => {
        const offenders = edges.filter(
            ({ from, specifier }) =>
                !from.startsWith(UI) &&
                (specifier.startsWith("@bpmn-io/properties-panel") || specifier.endsWith(".css")),
        );

        expect(offenders.map(({ from, specifier }) => `${from} -> ${specifier}`)).toEqual([]);
    });

    it("keeps the domain free of the DOM", () => {
        const browserGlobal = /\b(document|window|HTMLElement|navigator)\b/;
        const offenders = tree.filter(
            ({ path, text }) =>
                path.startsWith(DOMAIN) && browserGlobal.test(stripComments(path, text)),
        );

        expect(offenders.map(({ path }) => path)).toEqual([]);
    });

    it("keeps rules out of the catalog, which only looks up an engine's data", () => {
        const functions = tree
            .filter(({ path }) => path.startsWith(CATALOG))
            .flatMap(({ text }) =>
                [...text.matchAll(/\bfunction\s+(\w+)/g)].map(([, name]) => name),
            );

        expect(functions).toEqual(["catalogFor"]);
    });
});
