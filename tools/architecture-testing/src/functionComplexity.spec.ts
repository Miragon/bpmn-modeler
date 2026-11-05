import { describe, expect, it } from "vitest";

import { readCodeLines, readFunctionComplexities } from "./functionComplexity";

function complexityOf(statements: string): number {
    const [unit] = readFunctionComplexities("a.ts", `function f(a, b, c) {\n${statements}\n}`);
    return unit.complexity;
}

describe("readFunctionComplexities", () => {
    it("gives a function with three if statements complexity 4", () => {
        const source = [
            "export function classify(value: number): string {",
            "    if (value < 0) {",
            '        return "negative";',
            "    }",
            "    if (value === 0) {",
            '        return "zero";',
            "    }",
            "    if (value > 100) {",
            '        return "large";',
            "    }",
            '    return "small";',
            "}",
        ].join("\n");

        expect(readFunctionComplexities("a.ts", source)).toEqual([
            { name: "classify", line: 1, complexity: 4 },
        ]);
    });

    it.each([
        { case: "a straight function", statements: "return a;", complexity: 1 },
        {
            case: "an if with else if",
            statements: "if (a) {} else if (b) {} else {}",
            complexity: 3,
        },
        { case: "a conditional expression", statements: "return a ? b : c;", complexity: 2 },
        { case: "each && and ||", statements: "return a && b || c && a;", complexity: 4 },
        { case: "a ??", statements: "return a ?? b;", complexity: 2 },
        { case: "a logical assignment", statements: "a &&= b; a ||= c; a ??= b;", complexity: 4 },
        { case: "a plain or compound assignment", statements: "a = b; a += c;", complexity: 1 },
        { case: "a for loop", statements: "for (let i = 0; i < a; i++) {}", complexity: 2 },
        { case: "a for-in loop", statements: "for (const key in a) {}", complexity: 2 },
        { case: "a for-of loop", statements: "for (const item of a) {}", complexity: 2 },
        { case: "a while loop", statements: "while (a) {}", complexity: 2 },
        { case: "a do loop", statements: "do {} while (a);", complexity: 2 },
        {
            case: "a catch",
            statements: "try { a(); } catch { b(); } finally { c(); }",
            complexity: 2,
        },
        {
            case: "each case with a test, not the default",
            statements: "switch (a) { case 1: break; case 2: case 3: break; default: }",
            complexity: 4,
        },
        {
            case: "a binding-element default",
            statements: "const { x = 1, y: [z = 2] } = a;",
            complexity: 3,
        },
        {
            case: "a destructuring-assignment default",
            statements:
                "({ x = 1, y: [z = 2], ...rest } = a); [b = 1, ...c] = a; ({ y: { z: d = 3 } } = a);",
            complexity: 5,
        },
        {
            case: "a for-of destructuring-assignment default",
            statements: "for ([b = 1] of a) {}",
            complexity: 3,
        },
        {
            case: "a nested array destructuring-assignment default once",
            statements: "[[b = 1] = []] = a;",
            complexity: 3,
        },
        {
            case: "a nested object destructuring-assignment default once",
            statements: "({ x: { y = 1 } = {} } = a);",
            complexity: 3,
        },
        {
            case: "a nested for-of destructuring-assignment default once",
            statements: "for ([[b = 1] = []] of a);",
            complexity: 4,
        },
        {
            case: "a nested for-in destructuring-assignment default once",
            statements: "for ({ x: { y = 1 } = {} } in a);",
            complexity: 4,
        },
        { case: "a for-in plain target", statements: "for (b in a) {}", complexity: 2 },
        { case: "an optional member access", statements: "return a?.b.c;", complexity: 2 },
        { case: "an optional element access", statements: "return a?.[0];", complexity: 2 },
        { case: "an optional call", statements: "return a?.();", complexity: 2 },
        { case: "an optional member called", statements: "return a?.b();", complexity: 2 },
    ])("counts $case", ({ statements, complexity }) => {
        expect(complexityOf(statements)).toBe(complexity);
    });

    it("counts each parameter default", () => {
        expect(readFunctionComplexities("a.ts", "function f(a = 1, { b = 2 } = {}) {}")).toEqual([
            { name: "f", line: 1, complexity: 4 },
        ]);
    });

    it("counts nothing in types, a conditional type included", () => {
        const source = [
            "type Pick<T> = T extends string ? T : never;",
            "function f<T extends object>(a: T extends string ? 1 : 2): typeof a extends 1 ? 1 : 2 {",
            "    const b: { c?: string } = {};",
            "    return a as T extends string ? 1 : 2;",
            "}",
        ].join("\n");

        expect(readFunctionComplexities("a.ts", source)).toEqual([
            { name: "f", line: 2, complexity: 1 },
        ]);
    });

    it("counts a nested function on its own and top-level code not at all", () => {
        const source = [
            "const top = a ? b : c;",
            "function outer(a) {",
            "    if (a) {}",
            "    const inner = (b) => b ?? a;",
            "    return inner;",
            "}",
        ].join("\n");

        expect(readFunctionComplexities("a.ts", source)).toEqual([
            { name: "outer", line: 2, complexity: 2 },
            { name: "inner", line: 4, complexity: 2 },
        ]);
    });

    it("reads methods, constructors, accessors, field initializers and static blocks", () => {
        const source = [
            "class Store {",
            "    @logged(a ?? b)",
            "    field = a ? b : c;",
            "    handler = () => a?.b;",
            "    declare declared: string;",
            "    accessor auto = a ? 1 : 2;",
            "    static {",
            "        if (a) {}",
            "    }",
            "    constructor(private readonly value = 1) {}",
            "    get size() { return a || b; }",
            "    set size(next) { if (next) {} }",
            "    [a ?? b]() {}",
            "    abstract(): void;",
            "    #hidden() { return a && b; }",
            "}",
        ].join("\n");

        expect(readFunctionComplexities("a.ts", source)).toEqual([
            { name: "field", line: 3, complexity: 2 },
            { name: "handler", line: 4, complexity: 1 },
            { name: "handler", line: 4, complexity: 2 },
            { name: "static block", line: 7, complexity: 2 },
            { name: "constructor", line: 10, complexity: 2 },
            { name: "size", line: 11, complexity: 2 },
            { name: "size", line: 12, complexity: 2 },
            { name: "anonymous", line: 13, complexity: 1 },
            { name: "#hidden", line: 15, complexity: 2 },
        ]);
    });

    it("names a function after what holds it", () => {
        const source = [
            "export default function () {}",
            "const named = function inner() {};",
            "const object = { method() {}, property: () => 1, 'quoted': function () {}, 7: () => 1 };",
            "run(() => 1);",
            "declare function ambient(): void;",
        ].join("\n");

        expect(readFunctionComplexities("a.ts", source).map(({ name }) => name)).toEqual([
            "anonymous",
            "inner",
            "method",
            "property",
            "quoted",
            "7",
            "anonymous",
        ]);
    });

    it("dates an arrow function to its arrow", () => {
        const source = ["const f = (", "    a,", ") =>", "    a;"].join("\n");

        expect(readFunctionComplexities("a.ts", source)).toEqual([
            { name: "f", line: 3, complexity: 1 },
        ]);
    });

    it("reads TSX", () => {
        const source = "export const View = ({ a }) => <div>{a && <span />}</div>;";

        expect(readFunctionComplexities("a.tsx", source)).toEqual([
            { name: "View", line: 1, complexity: 2 },
        ]);
    });
});

describe("readCodeLines", () => {
    it.each([
        { case: "an empty file", source: "", lines: 0 },
        { case: "blank lines", source: "const a = 1;\n\n   \nconst b = 2;\n", lines: 2 },
        { case: "line comments", source: "// one\nconst a = 1;\n  // two", lines: 1 },
        { case: "a block comment", source: "/**\n * docs\n */\nconst a = 1;", lines: 1 },
        {
            case: "a trailing comment",
            source: "const a = 1; // why\n/* x */ const b = 2;",
            lines: 2,
        },
        {
            case: "every line a multi-line template spans",
            source: "const a = `\n\n  text\n`;",
            lines: 4,
        },
        {
            case: "a template with substitutions over several lines",
            source: "const a = `${b}\n\n${c}`;",
            lines: 3,
        },
    ])("counts $case", ({ source, lines }) => {
        expect(readCodeLines("a.ts", source)).toBe(lines);
    });

    it("counts no whitespace-only JSX text and every line of JSX text that holds some", () => {
        const source = [
            "export const View = () => (",
            "    <div>",
            "",
            "        Hello",
            "        <span />",
            "    </div>",
            ");",
        ].join("\n");

        expect(readCodeLines("a.tsx", source)).toBe(6);
    });
});
