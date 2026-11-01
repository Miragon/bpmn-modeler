import { describe, expect, it } from "vitest";

import type { ImportGraph } from "./importGraph";
import { findPortAdapters, portAdapterViolations } from "./portAdapters";

describe("findPortAdapters", () => {
    it("finds the files declaring a class that implements a port", () => {
        const adapters = findPortAdapters([
            {
                path: "editor/infrastructure/VsEditor.ts",
                text: "export class VsEditor implements Disposable, EditorPort {}",
            },
            {
                path: "editor/infrastructure/VsDocument.ts",
                text: "export const create = () => new (class implements core.DocumentPort {})();",
            },
            { path: "editor/Disposer.ts", text: "export class Disposer implements Disposable {}" },
            {
                path: "editor/PortHelper.ts",
                text: "export class PortHelper extends EditorPort implements PortFactory {}",
            },
            { path: "editor/ports.ts", text: "export interface FilePort extends EditorPort {}" },
            { path: "editor/Report.ts", text: "export class Summary implements Report {}" },
        ]);

        expect([...adapters]).toEqual([
            "editor/infrastructure/VsEditor.ts",
            "editor/infrastructure/VsDocument.ts",
        ]);
    });
});

describe("portAdapterViolations", () => {
    const isAdapterHome = (path: string): boolean =>
        path.startsWith("composition/") || path.split("/").includes("infrastructure");

    it.each([
        {
            case: "an adapter outside its homes with only a self-edge",
            adapter: "a/controller/Foo.ts",
            imports: [["a/controller/Foo.ts", "a/controller/Foo.ts"]],
            expected: { misplacedAdapters: ["a/controller/Foo.ts"], adapterImports: [] },
        },
        {
            case: "an adapter outside its homes that nothing imports",
            adapter: "a/controller/Foo.ts",
            imports: [],
            expected: { misplacedAdapters: ["a/controller/Foo.ts"], adapterImports: [] },
        },
        {
            case: "an adapter outside its homes that only composition imports",
            adapter: "a/controller/Foo.ts",
            imports: [["composition/root.ts", "a/controller/Foo.ts"]],
            expected: { misplacedAdapters: ["a/controller/Foo.ts"], adapterImports: [] },
        },
        {
            case: "an adapter outside its homes that a sibling imports",
            adapter: "a/controller/Foo.ts",
            imports: [["a/controller/Bar.ts", "a/controller/Foo.ts"]],
            expected: {
                misplacedAdapters: ["a/controller/Foo.ts"],
                adapterImports: [{ from: "a/controller/Bar.ts", to: "a/controller/Foo.ts" }],
            },
        },
        {
            case: "an infrastructure adapter that a controller imports twice",
            adapter: "a/infrastructure/Foo.ts",
            imports: [
                ["a/controller/Bar.ts", "a/infrastructure/Foo.ts"],
                ["a/controller/Bar.ts", "a/infrastructure/Foo.ts"],
            ],
            expected: {
                misplacedAdapters: [],
                adapterImports: [{ from: "a/controller/Bar.ts", to: "a/infrastructure/Foo.ts" }],
            },
        },
        {
            case: "an infrastructure adapter that composition and infrastructure import",
            adapter: "a/infrastructure/Foo.ts",
            imports: [
                ["composition/root.ts", "a/infrastructure/Foo.ts"],
                ["b/infrastructure/Baz.ts", "a/infrastructure/Foo.ts"],
            ],
            expected: { misplacedAdapters: [], adapterImports: [] },
        },
        {
            case: "a controller importing a non-adapter and a package",
            adapter: "a/infrastructure/Foo.ts",
            imports: [
                ["a/controller/Bar.ts", "a/domain/rule.ts"],
                ["a/controller/Bar.ts", undefined],
            ],
            expected: { misplacedAdapters: [], adapterImports: [] },
        },
    ] satisfies {
        case: string;
        adapter: string;
        imports: [from: string, to: string | undefined][];
        expected: unknown;
    }[])("reports $case", ({ adapter, imports, expected }) => {
        expect(
            portAdapterViolations(new Set([adapter]), importGraph(imports), isAdapterHome),
        ).toEqual(expected);
    });
});

function importGraph(imports: readonly [from: string, to: string | undefined][]): ImportGraph {
    return {
        files: [
            ...new Set(imports.flatMap(([from, to]) => (to === undefined ? [from] : [from, to]))),
        ],
        edges: imports.map(([from, to]) =>
            to === undefined
                ? { from, specifier: "package", typeOnly: false }
                : { from, specifier: to, typeOnly: false, to },
        ),
    };
}
