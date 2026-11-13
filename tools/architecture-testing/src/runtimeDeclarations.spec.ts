import { describe, expect, it } from "vitest";

import { readRuntimeDeclarations } from "./runtimeDeclarations";

describe("readRuntimeDeclarations", () => {
    it.each([
        { form: "a type import", source: 'import type { A } from "./a";' },
        { form: "a named import", source: 'import { A } from "./a";' },
        { form: "a default import", source: 'import A from "./a";' },
        { form: "a namespace import", source: 'import * as a from "./a";' },
        { form: "an interface", source: "export interface A { b(): void }" },
        { form: "a stray semicolon after an interface", source: "export interface A {};" },
        { form: "a declared interface", source: "declare interface A {}" },
        { form: "a type alias", source: "export type A = (b: string) => void;" },
        { form: "a type re-export", source: 'export type { A, B as C } from "./a";' },
        { form: "a re-export of type elements", source: 'export { type A, type B } from "./a";' },
        { form: "a type star re-export", source: 'export type * from "./a";' },
        { form: "a type namespace re-export", source: 'export type * as a from "./a";' },
        { form: "a type export list", source: "interface A {}\nexport type { A };" },
        { form: "an empty export list", source: "export {};" },
        { form: "an empty file", source: "" },
    ])("allows $form", ({ source }) => {
        expect(readRuntimeDeclarations("port.ts", source)).toEqual([]);
    });

    it.each([
        { form: "const", source: "export const a = 1;", name: "a" },
        { form: "let", source: "let a = 1, b = 2;", name: "a, b" },
        { form: "var", source: "var a;", name: "a" },
        { form: "const", source: "declare const a: string;", name: "a" },
        { form: "const", source: "export const { a, b } = value;", name: "{ a, b }" },
        { form: "function", source: "export function a() {}", name: "a" },
        { form: "function", source: "declare function a(): void;", name: "a" },
        { form: "class", source: "export class A {}", name: "A" },
        { form: "class", source: "export abstract class A {}", name: "A" },
        { form: "enum", source: "export enum A { B }", name: "A" },
        { form: "enum", source: "export const enum A { B }", name: "A" },
        { form: "namespace", source: "export namespace A {}", name: "A" },
        { form: "namespace", source: 'declare module "pkg" {}', name: "pkg" },
        { form: "namespace", source: "declare global {}", name: "global" },
        { form: "export default", source: "export default interface A {}", name: "A" },
        { form: "export default", source: "export default function () {}", name: "default" },
        { form: "export default", source: "export default class {}", name: "default" },
        { form: "export default", source: "export default { a: 1 };", name: "default" },
        { form: "export =", source: "export = a;", name: "default" },
        { form: "value export", source: 'export { a } from "./a";', name: "a" },
        { form: "value export", source: 'export { type A, b as c } from "./a";', name: "c" },
        { form: "value export", source: "interface A {} export { A };", name: "A" },
        { form: "export *", source: 'export * from "./a";', name: "./a" },
        { form: "export *", source: 'export * as a from "./a";', name: "./a" },
        { form: "side-effect import", source: 'import "./a";', name: "./a" },
        { form: "side-effect export", source: 'export {} from "./a";', name: "./a" },
        { form: "import =", source: 'import a = require("./a");', name: "a" },
        { form: "import =", source: "import a = B.c;", name: "a" },
        { form: "statement", source: "register();", name: "register();" },
        { form: "statement", source: "register(\n    1,\n);", name: "register(" },
    ])("reports a $form in `$source`", ({ form, source, name }) => {
        expect(readRuntimeDeclarations("port.ts", source)).toEqual([{ form, name, line: 1 }]);
    });

    it("reports the namespace that holds a value, at its own line", () => {
        const source = [
            'import type { A } from "./a";',
            "",
            "export namespace Channels {",
            '    export const OPEN = "open";',
            "}",
        ].join("\n");

        expect(readRuntimeDeclarations("port.ts", source)).toEqual([
            { form: "namespace", name: "Channels", line: 3 },
        ]);
    });

    it("reads a .tsx file with JSX", () => {
        const source = [
            "export interface ViewProps { title: string }",
            "export const View = (props: ViewProps) => <h1>{props.title}</h1>;",
        ].join("\n");

        expect(readRuntimeDeclarations("port.tsx", source)).toEqual([
            { form: "const", name: "View", line: 2 },
        ]);
    });
});
