import { describe, expect, it } from "vitest";

import { readTextLiterals } from "./textLiterals";

function partsIn(source: string, fileName = "a.ts"): (readonly string[])[] {
    return readTextLiterals(fileName, source).map(({ parts }) => parts);
}

function callsAround(source: string) {
    return readTextLiterals("a.ts", source).map(({ argumentOf }) => argumentOf);
}

describe("readTextLiterals", () => {
    it("reads string, plain template and template literals with their line, in source order", () => {
        const source = [
            "// 'a commented text'",
            "const a = 'single quoted';",
            'const b = "double quoted";',
            "const c = `plain template`;",
            "const d = `Token for ${host} at ${port}.`;",
        ].join("\n");

        expect(readTextLiterals("a.ts", source)).toEqual([
            { line: 2, parts: ["single quoted"], argumentOf: [] },
            { line: 3, parts: ["double quoted"], argumentOf: [] },
            { line: 4, parts: ["plain template"], argumentOf: [] },
            { line: 5, parts: ["Token for ", " at ", "."], argumentOf: [] },
        ]);
    });

    it("reads a literal inside a placeholder as a literal of its own", () => {
        expect(
            partsIn("const a = `Saved ${count === 1 ? 'one file' : `${count} files`}`;"),
        ).toEqual([["Saved ", ""], ["one file"], ["", " files"]]);
    });

    it("reads the literal a type assertion or `satisfies` wraps", () => {
        expect(
            partsIn("const a = 'as text' as const;\nconst b = 'kept text' satisfies string;"),
        ).toEqual([["as text"], ["kept text"]]);
    });

    it.each([
        { form: "a union of literal types", source: "type T = 'a b' | 'c';" },
        { form: "a template literal type", source: "type T = `prefix ${string} suffix`;" },
        { form: "a parameter type", source: "function f(kind: 'file kind' | 'dir'): void {}" },
        { form: "an indexed access type", source: "type T = Labels['the label'];" },
        { form: "a type argument", source: "const m = new Map<'a b', number>();" },
    ])("does not read $form", ({ source }) => {
        expect(partsIn(source)).toEqual([]);
    });

    it.each([
        { form: "an import", source: "import { window } from 'vscode api';" },
        { form: "a side-effect import", source: "import 'polyfill file';" },
        { form: "a re-export", source: "export { a } from './a b';" },
        { form: "an import-equals", source: "import fs = require('file system');" },
    ])("does not read the module specifier of $form", ({ source }) => {
        expect(partsIn(source)).toEqual([]);
    });

    it("reads JSX attributes in a .tsx file", () => {
        expect(partsIn('const a = <button title="Reload the window" />;', "View.tsx")).toEqual([
            ["Reload the window"],
        ]);
    });

    it.each([
        {
            call: "a bare function",
            source: "log('the text');",
            site: { construct: false, callee: "log" },
        },
        {
            call: "a method of a name",
            source: "console.error('the text');",
            site: { construct: false, callee: "error", receiver: "console" },
        },
        {
            call: "a method of a property",
            source: "this.logger.info('the text');",
            site: { construct: false, callee: "info", receiver: "logger" },
        },
        {
            call: "a method of this",
            source: "this.show('the text');",
            site: { construct: false, callee: "show" },
        },
        {
            call: "an optional and a non-null receiver",
            source: "this.logger!.warn?.('the text');",
            site: { construct: false, callee: "warn", receiver: "logger" },
        },
        {
            call: "a parenthesized callee",
            source: "(window.showErrorMessage)('the text');",
            site: { construct: false, callee: "showErrorMessage", receiver: "window" },
        },
        {
            call: "a method on a call's result",
            source: "getLogger().info('the text');",
            site: { construct: false, callee: "info" },
        },
        {
            call: "a callee without a name",
            source: "handlers[0]('the text');",
            site: { construct: false },
        },
        {
            call: "a constructor",
            source: "throw new Error('the text');",
            site: { construct: true, callee: "Error" },
        },
    ])("names the call around an argument: $call", ({ source, site }) => {
        expect(callsAround(source)).toEqual([[site]]);
    });

    it("lists every call around an argument, outermost first, and none around the callee", () => {
        expect(
            callsAround("logger.info(format(`${read('the key')} text`));\nlookup('a b').show();"),
        ).toEqual([
            [
                { construct: false, callee: "info", receiver: "logger" },
                { construct: false, callee: "format" },
            ],
            [
                { construct: false, callee: "info", receiver: "logger" },
                { construct: false, callee: "format" },
                { construct: false, callee: "read" },
            ],
            [{ construct: false, callee: "lookup" }],
        ]);
    });

    it("names only the calls inside the nearest function: the code a callee runs is no value it is handed", () => {
        expect(
            callsAround(
                "logAndRethrow(async () => { window.showQuickPick(items, { placeHolder: 'the text' }); });\n" +
                    "logger.info(function () { return 'lazy text'; });\n" +
                    "logger.info(items.map((item) => item.name).join(', '));",
            ),
        ).toEqual([
            [{ construct: false, callee: "showQuickPick", receiver: "window" }],
            [],
            [
                { construct: false, callee: "info", receiver: "logger" },
                { construct: false, callee: "join" },
            ],
        ]);
    });

    it("reads no arguments of a `new` without an argument list", () => {
        expect(callsAround("const e = new Thing;\nconst a = 'after it';")).toEqual([[]]);
    });
});
