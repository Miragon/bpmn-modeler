import { buildImportGraph, readSourceTree } from "@miragon/architecture-testing";
import { describe, expect, it } from "vitest";

/**
 * The library's layers point one way: the catalog is the engines' data, the
 * domain holds the rules over it as pure code, and the UI renders both. The
 * page (`apps/bpmn-webview`) only reaches them through `index.ts`.
 */
const tree = readSourceTree(__dirname);
const { edges } = buildImportGraph(tree);

function isIn(path: string, layer: string): boolean {
    return path.startsWith(`${layer}/`);
}

function reachesOut(from: string, to: string): string[] {
    return edges
        .filter((edge) => isIn(edge.from, from) && edge.to !== undefined && isIn(edge.to, to))
        .map((edge) => `${edge.from} -> ${edge.to}`);
}

describe("the template builder's layers", () => {
    it.each([
        ["catalog", "domain"],
        ["catalog", "ui"],
        ["domain", "ui"],
    ])("%s does not import %s", (from, to) => {
        expect(reachesOut(from, to)).toEqual([]);
    });

    it("keeps the UI toolkit in the UI", () => {
        const offenders = edges.filter(
            ({ from, specifier }) =>
                !isIn(from, "ui") &&
                (specifier.startsWith("@bpmn-io/properties-panel") || specifier.endsWith(".css")),
        );

        expect(offenders.map(({ from, specifier }) => `${from} -> ${specifier}`)).toEqual([]);
    });

    it("keeps the domain free of the DOM", () => {
        const browserGlobal = /\b(document|window|HTMLElement|navigator)\b/;
        const offenders = tree.filter(
            ({ path, text }) => isIn(path, "domain") && browserGlobal.test(text),
        );

        expect(offenders.map(({ path }) => path)).toEqual([]);
    });

    it("keeps rules out of the catalog, which only looks up an engine's data", () => {
        const functions = tree
            .filter(({ path }) => isIn(path, "catalog"))
            .flatMap(({ text }) =>
                [...text.matchAll(/\bfunction\s+(\w+)/g)].map(([, name]) => name),
            );

        expect(functions).toEqual(["catalogFor"]);
    });
});
