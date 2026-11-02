import { describe, expect, it } from "vitest";

import { findImportCycles } from "./importCycles";

const edge = (from: string, to?: string) => ({ from, to });

describe("findImportCycles", () => {
    it.each([
        {
            name: "an acyclic graph",
            edges: [edge("a", "b"), edge("b", "c"), edge("a", "c")],
            cycles: [],
        },
        { name: "a two-file cycle", edges: [edge("a", "b"), edge("b", "a")], cycles: [["a", "b"]] },
        {
            name: "a cycle reached through a file outside it",
            edges: [edge("entry", "b"), edge("b", "c"), edge("c", "b")],
            cycles: [["b", "c"]],
        },
        { name: "a self-import", edges: [edge("a", "a")], cycles: [["a"]] },
        {
            name: "a cycle whose import is written twice",
            edges: [edge("a", "b"), edge("b", "a"), edge("b", "a")],
            cycles: [["a", "b"]],
        },
        {
            name: "a tangle of three files closed by two imports",
            edges: [edge("a", "b"), edge("b", "c"), edge("c", "a"), edge("b", "a")],
            cycles: [["a", "b", "c"]],
        },
        {
            name: "two separate cycles",
            edges: [edge("z", "z"), edge("m", "n"), edge("n", "m")],
            cycles: [["m", "n"], ["z"]],
        },
        {
            name: "edges that resolve to no file",
            edges: [edge("a"), edge("b", "a"), edge("a")],
            cycles: [],
        },
    ])("finds the cycles of $name", ({ edges, cycles }) => {
        expect(findImportCycles(edges)).toEqual(cycles);
    });
});
