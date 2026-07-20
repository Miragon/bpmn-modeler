import { describe, expect, it } from "vitest";

import { collectLocalDeclarations, LocalDeclaration } from "./localDeclarations";

const names = (declarations: LocalDeclaration[]): string[] => declarations.map((decl) => decl.name);

describe("collectLocalDeclarations", () => {
    describe("groovy", () => {
        it("collects a def declaration with initializer", () => {
            expect(collectLocalDeclarations("def total = 1", "groovy")).toEqual([
                { name: "total", line: 0, kind: "variable" },
            ]);
        });

        it("collects a bare def declaration without initializer", () => {
            expect(names(collectLocalDeclarations("def x", "groovy"))).toEqual(["x"]);
        });

        it("collects typed declarations, including generics", () => {
            const script = 'String name = "x"\nList<String> xs = []';
            expect(names(collectLocalDeclarations(script, "groovy"))).toEqual(["name", "xs"]);
        });

        it("classifies a def method as a function, not a variable", () => {
            expect(collectLocalDeclarations("def helper() {", "groovy")).toEqual([
                { name: "helper", line: 0, kind: "function" },
            ]);
        });

        it("ignores a comparison that only looks like a declaration", () => {
            expect(collectLocalDeclarations("def x == y", "groovy")).toEqual([]);
        });

        it("skips commented-out declarations", () => {
            const script = "// def ghost = 1\n/* def spectre = 2 */\n * def phantom = 3";
            expect(collectLocalDeclarations(script, "groovy")).toEqual([]);
        });

        it("yields nothing for plain statements", () => {
            expect(collectLocalDeclarations('execution.setVariable("a", 1)', "groovy")).toEqual([]);
        });

        it("dedups a re-declared name to its first line, preserving order", () => {
            const script = "def total = 1\ndef other = 2\ndef total = 3";
            expect(collectLocalDeclarations(script, "groovy")).toEqual([
                { name: "total", line: 0, kind: "variable" },
                { name: "other", line: 1, kind: "variable" },
            ]);
        });

        describe("typeHint inference", () => {
            const hintFor = (script: string): string | undefined =>
                collectLocalDeclarations(script, "groovy")[0]?.typeHint;

            it("infers a trailing `as` cast (the user's report)", () => {
                const line = 'def myProcessVar = execution.getVariable("v") as SpinJsonNode';
                expect(hintFor(line)).toBe("SpinJsonNode");
            });

            it("infers the leading type of a typed declaration", () => {
                expect(hintFor("SpinJsonNode node = payload")).toBe("SpinJsonNode");
            });

            it("strips generics from a typed declaration", () => {
                expect(hintFor("List<String> xs = []")).toBe("List");
            });

            it("infers SpinJsonNode from an S()/JSON() initializer", () => {
                expect(hintFor("def node = S('{}')")).toBe("SpinJsonNode");
                expect(hintFor("def node = JSON('{}')")).toBe("SpinJsonNode");
            });

            it("lets a trailing cast beat the declared type on the same line", () => {
                expect(hintFor("SpinJsonNode node = raw as String")).toBe("String");
            });

            it("leaves an untyped initializer without a hint", () => {
                expect(hintFor("def total = 1")).toBeUndefined();
            });

            it("leaves a mid-line cast without a hint (accepted gap)", () => {
                expect(hintFor('def x = (a as SpinJsonNode).prop("b")')).toBeUndefined();
            });

            it("never infers a type outside groovy", () => {
                expect(collectLocalDeclarations("String x = 1", "javascript")).toEqual([]);
                expect(
                    collectLocalDeclarations("x = S('{}')", "python")[0]?.typeHint,
                ).toBeUndefined();
            });
        });
    });

    describe("javascript", () => {
        it("collects var, let and const declarations", () => {
            const script = "var a = 1\nlet b = 2\nconst c = 3";
            expect(names(collectLocalDeclarations(script, "javascript"))).toEqual(["a", "b", "c"]);
        });

        it("classifies function declarations, async included", () => {
            const script = "function fmt(x) {}\nasync function load() {}";
            expect(collectLocalDeclarations(script, "javascript")).toEqual([
                { name: "fmt", line: 0, kind: "function" },
                { name: "load", line: 1, kind: "function" },
            ]);
        });

        it("collects only the first declarator of a multi-declaration (accepted gap)", () => {
            expect(names(collectLocalDeclarations("let a, b", "javascript"))).toEqual(["a"]);
        });
    });

    describe("python", () => {
        it("collects assignments, indented ones included", () => {
            const script = "x = 1\n    y = 2";
            expect(names(collectLocalDeclarations(script, "python"))).toEqual(["x", "y"]);
        });

        it("ignores comparisons and comments", () => {
            const script = "x == 1\n# x = 1";
            expect(collectLocalDeclarations(script, "python")).toEqual([]);
        });

        it("classifies def as a function", () => {
            expect(collectLocalDeclarations("def handle(msg):", "python")).toEqual([
                { name: "handle", line: 0, kind: "function" },
            ]);
        });

        it("never suggests a stop-word capture from malformed input", () => {
            expect(collectLocalDeclarations("if = 1", "python")).toEqual([]);
        });
    });

    describe("ruby", () => {
        it("collects assignments but not comparisons", () => {
            const script = "x = 1\ny == 2";
            expect(names(collectLocalDeclarations(script, "ruby"))).toEqual(["x"]);
        });

        it("ignores hash rockets inside a literal but keeps the assignment", () => {
            expect(names(collectLocalDeclarations('h = { "a" => 1 }', "ruby"))).toEqual(["h"]);
        });

        it("classifies def as a function", () => {
            expect(collectLocalDeclarations("def handle", "ruby")).toEqual([
                { name: "handle", line: 0, kind: "function" },
            ]);
        });
    });

    it("returns nothing for an unknown language id", () => {
        expect(collectLocalDeclarations("def x = 1", "plaintext")).toEqual([]);
    });

    it("returns nothing for empty text", () => {
        expect(collectLocalDeclarations("", "groovy")).toEqual([]);
    });

    it("handles CRLF line endings with correct line numbers", () => {
        expect(collectLocalDeclarations("def a = 1\r\ndef b = 2", "groovy")).toEqual([
            { name: "a", line: 0, kind: "variable" },
            { name: "b", line: 1, kind: "variable" },
        ]);
    });
});
