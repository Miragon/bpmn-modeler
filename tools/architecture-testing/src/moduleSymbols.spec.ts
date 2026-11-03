import { describe, expect, it } from "vitest";

import { readModuleSymbols } from "./moduleSymbols";

describe("readModuleSymbols", () => {
    it.each([
        { form: "named imports", source: 'import { a, b as c } from "./a";', names: ["a", "b"] },
        { form: "a type import", source: 'import type { A } from "./a";', names: ["A"] },
        { form: "a default import", source: 'import a from "./a";', names: ["default"] },
        {
            form: "a default import beside named ones",
            source: 'import a, { b } from "./a";',
            names: ["default", "b"],
        },
        { form: "a side-effect import", source: 'import "./a";', names: [] },
        { form: "a namespace import", source: 'import * as a from "./a";', names: undefined },
        { form: "a dynamic import", source: 'const a = import("./a");', names: undefined },
        { form: "a require call", source: 'const a = require("./a");', names: undefined },
        {
            form: "an import-equals require",
            source: 'import a = require("./a");',
            names: undefined,
        },
        { form: "an import type", source: 'type A = import("./a").A;', names: undefined },
    ])("reads $form", ({ source, names }) => {
        expect(readModuleSymbols("module.ts", source).imports).toEqual([
            names === undefined ? { specifier: "./a" } : { specifier: "./a", names },
        ]);
    });

    it("ignores a dynamic import of a computed path", () => {
        expect(readModuleSymbols("module.ts", "const a = import(path);").imports).toEqual([]);
    });

    it.each([
        { form: "a const", source: "export const a = 1, b = 2;", declared: ["a", "b"] },
        {
            form: "a destructured const",
            source: "export const { a, b: [, c, ...d] } = value;",
            declared: ["a", "c", "d"],
        },
        { form: "a module augmentation", source: 'export declare module "pkg" {}', declared: [] },
        { form: "a function", source: "export function a() {}", declared: ["a"] },
        { form: "a class", source: "export class A {}", declared: ["A"] },
        { form: "an interface", source: "export interface A {}", declared: ["A"] },
        { form: "a type alias", source: "export type A = string;", declared: ["A"] },
        { form: "an enum", source: "export enum A { B }", declared: ["A"] },
        { form: "a namespace", source: "export namespace A {}", declared: ["A"] },
        {
            form: "a default function",
            source: "export default function a() {}",
            declared: ["default"],
        },
        { form: "a default class", source: "export default class {}", declared: ["default"] },
        { form: "a default expression", source: "export default { a: 1 };", declared: ["default"] },
        {
            form: "a local export list",
            source: "const a = 1;\nconst b = 2;\nexport { a, b as c };",
            declared: ["a", "c"],
        },
    ])("reads $form as declared", ({ source, declared }) => {
        const symbols = readModuleSymbols("module.ts", source);

        expect(symbols.declaredExports).toEqual(declared);
        expect(symbols.declaresNothing).toBe(false);
    });

    it("leaves an unexported declaration out", () => {
        expect(readModuleSymbols("module.ts", "const a = 1;").declaredExports).toEqual([]);
    });

    it.each([
        {
            form: "a named re-export",
            source: 'export { a, b as c } from "./a";',
            reExports: [
                { exported: "a", specifier: "./a", imported: "a" },
                { exported: "c", specifier: "./a", imported: "b" },
            ],
        },
        {
            form: "a default re-export",
            source: 'export { default as a } from "./a";',
            reExports: [{ exported: "a", specifier: "./a", imported: "default" }],
        },
        {
            form: "a namespace re-export",
            source: 'export * as a from "./a";',
            reExports: [{ exported: "a", specifier: "./a" }],
        },
        {
            form: "a local re-export of an imported binding",
            source: 'import { a, b } from "./a";\nexport { a, b as c };',
            reExports: [
                { exported: "a", specifier: "./a", imported: "a" },
                { exported: "c", specifier: "./a", imported: "b" },
            ],
        },
        {
            form: "a local re-export of a default import",
            source: 'import a from "./a";\nexport { a };',
            reExports: [{ exported: "a", specifier: "./a", imported: "default" }],
        },
        {
            form: "a local re-export of a namespace import",
            source: 'import * as a from "./a";\nexport { a };',
            reExports: [{ exported: "a", specifier: "./a" }],
        },
        {
            form: "a default export of an imported binding",
            source: 'import { a } from "./a";\nexport default a;',
            reExports: [{ exported: "default", specifier: "./a", imported: "a" }],
        },
    ])("reads $form", ({ source, reExports }) => {
        const symbols = readModuleSymbols("module.ts", source);

        expect(symbols.reExports).toEqual(reExports);
        expect(symbols.declaredExports).toEqual([]);
        expect(symbols.declaresNothing).toBe(true);
    });

    it("reads star re-exports", () => {
        const symbols = readModuleSymbols(
            "index.ts",
            'export * from "./a";\nexport type * from "./b";',
        );

        expect(symbols.starReExports).toEqual(["./a", "./b"]);
        expect(symbols.declaresNothing).toBe(true);
    });

    it.each([
        {
            form: "a file of imports and re-exports",
            source: 'import "./a.css";\nexport * from "./a";;',
        },
        { form: "an empty file", source: "" },
    ])("reads $form as declaring nothing", ({ source }) => {
        expect(readModuleSymbols("index.ts", source).declaresNothing).toBe(true);
    });

    it.each([
        {
            form: "a mixed index",
            source: 'export { a } from "./a";\nexport const Module = { a: 1 };',
        },
        { form: "a statement", source: 'import { run } from "./a";\nrun();' },
        { form: "an unexported declaration", source: 'export * from "./a";\nconst b = 1;' },
    ])("reads $form as declaring something", ({ source }) => {
        expect(readModuleSymbols("index.ts", source).declaresNothing).toBe(false);
    });

    it("reads a JavaScript module", () => {
        const symbols = readModuleSymbols(
            "script.mjs",
            'import { readFileSync } from "node:fs";\nexport const LOCALES = ["de"];',
        );

        expect(symbols.imports).toEqual([{ specifier: "node:fs", names: ["readFileSync"] }]);
        expect(symbols.declaredExports).toEqual(["LOCALES"]);
    });
});
