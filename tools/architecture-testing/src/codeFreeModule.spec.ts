import { describe, expect, it } from "vitest";

import { runsNoCode } from "./codeFreeModule";

describe("runsNoCode", () => {
    it.each([
        { form: "an empty file", source: "" },
        { form: "imports", source: 'import type { A } from "./a";\nimport b from "./b";' },
        { form: "types", source: "export interface A { b(): void }\nexport type C = () => void;" },
        { form: "re-exports", source: 'export * from "./a";\nexport { b as c } from "./b";' },
        { form: "an export list", source: "const a = 1;\nexport { a };" },
        { form: "a stray semicolon", source: "export interface A {};" },
        {
            form: "literals",
            source: 'export const a = "a", b = 1, c = -1, d = true, e = null, f = /f/u, g = `g`;',
        },
        { form: "a template of names", source: "export const a = `${b.c} and ${d}`;" },
        {
            form: "an array of literals and spreads",
            source: 'export const a = [...b, "c", , 1] as const;',
        },
        {
            form: "an object of literals, names and spreads",
            source: 'export const a = { b: "b", [c]: 1, d, ...e, "f": { g: [h] } } satisfies A;',
        },
        { form: "a name and a property read", source: "export const a = B, c = d.e.f;" },
        { form: "a parenthesized value read through !", source: "export const a = (b!) as C;" },
        { form: "a declared const", source: "declare const a: string;" },
    ])("holds for $form", ({ source }) => {
        expect(runsNoCode("data.ts", source)).toBe(true);
    });

    it.each([
        { form: "a function", source: "export function a() {}" },
        { form: "a class", source: "export class A {}" },
        { form: "an enum", source: "export enum A { B }" },
        { form: "a let", source: "export let a = 1;" },
        { form: "a statement", source: "a();" },
        { form: "a default export", source: "export default { a: 1 };" },
        { form: "a call", source: "export const a = b();" },
        { form: "a construction", source: "export const a = new B();" },
        { form: "an arrow function", source: "export const a = () => 1;" },
        { form: "an operator", source: "export const a = 1 + 2;" },
        { form: "a negated name", source: "export const a = -b;" },
        { form: "a conditional", source: "export const a = b ? 1 : 2;" },
        { form: "a tagged template", source: "export const a = tag`b`;" },
        { form: "an element read", source: "export const a = b[0];" },
        { form: "a call in a template", source: "export const a = `${b()}`;" },
        { form: "a call in an array", source: "export const a = [b()];" },
        { form: "a call in a spread", source: "export const a = [...b()];" },
        { form: "a method", source: "export const a = { b() {} };" },
        { form: "a getter", source: "export const a = { get b() { return 1; } };" },
        { form: "a computed name that calls", source: "export const a = { [b()]: 1 };" },
        { form: "a call in a value", source: "export const a = { b: c() };" },
        { form: "a call in a spread of an object", source: "export const a = { ...b() };" },
        { form: "a call behind a property read", source: "export const a = b().c;" },
        { form: "a later declarator that calls", source: "export const a = 1, b = c();" },
    ])("fails for $form", ({ source }) => {
        expect(runsNoCode("logic.ts", source)).toBe(false);
    });
});
