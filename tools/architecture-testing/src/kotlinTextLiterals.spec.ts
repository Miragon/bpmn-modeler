import { describe, expect, it } from "vitest";

import { readKotlinTextLiterals } from "./kotlinTextLiterals";

function partsIn(source: string): (readonly string[])[] {
    return readKotlinTextLiterals(source).map(({ parts }) => parts);
}

function callsAround(source: string) {
    return readKotlinTextLiterals(source).map(({ argumentOf }) => argumentOf);
}

describe("readKotlinTextLiterals", () => {
    it("reads string, raw string and template literals with their line, in source order", () => {
        const source = [
            '// "a commented text"',
            'val a = "plain text"',
            'val b = """raw text"""',
            'val c = "Token for $host at ${port}."',
            '/* "a block comment" /* nested "inside" */ still "comment" */',
            '/** KDoc "text" */',
            'val d = "after comments"',
        ].join("\n");

        expect(readKotlinTextLiterals(source)).toEqual([
            { line: 2, parts: ["plain text"], argumentOf: [] },
            { line: 3, parts: ["raw text"], argumentOf: [] },
            { line: 4, parts: ["Token for ", " at ", "."], argumentOf: [] },
            { line: 7, parts: ["after comments"], argumentOf: [] },
        ]);
    });

    it.each([
        {
            form: "a dollar before no name",
            source: 'val a = "Costs $5 or $"',
            parts: ["Costs $5 or $"],
        },
        { form: "a dollar before a placeholder", source: 'val a = "$$x"', parts: ["$", ""] },
        { form: "a backticked name", source: 'val a = "Hi $`odd name`!"', parts: ["Hi ", "!"] },
        {
            form: "decoded escapes",
            source: 'val a = "Line\\none \\"quoted\\" \\$x \\u0041\\t\\b\\r\\\\\\\'\\q"',
            parts: ['Line\none "quoted" $x A\t\b\r\\\'q'],
        },
        { form: "an empty string", source: 'val a = ""', parts: [""] },
        {
            form: "a string a line break ends",
            source: 'val a = "unclosed text\nval b = 1',
            parts: ["unclosed text"],
        },
    ])("reads $form", ({ source, parts }) => {
        expect(partsIn(source)).toEqual([parts]);
    });

    it("reads a raw string as written: no escapes, quotes inside, the last three quotes of a run close it", () => {
        expect(partsIn('val a = """say "hi"\\n to $name""""\nval b = """"quoted""""')).toEqual([
            ['say "hi"\\n to ', '"'],
            ['"quoted"'],
        ]);
    });

    it("counts the lines a raw string spans", () => {
        const source = ['val a = """', "    first line", '"""', 'val b = "next text"'].join("\n");

        expect(readKotlinTextLiterals(source).map(({ line }) => line)).toEqual([1, 4]);
    });

    it("needs as many dollars as the string's prefix before a placeholder", () => {
        expect(partsIn('val a = $$"""{"$schema": "$$id", "cost": "$$$x"}"""')).toEqual([
            ['{"$schema": "', '", "cost": "$', '"}'],
        ]);
    });

    it("reads a literal inside a placeholder as a literal of its own, quotes and braces included", () => {
        expect(
            partsIn(
                'val a = "Saved ${names.joinToString(", ")} files"\n' +
                    'val b = "${items.map { "${it.name} item" /* } */ }.size} found"',
            ),
        ).toEqual([["Saved ", " files"], [", "], ["", " found"], ["", " item"]]);
    });

    it.each([
        { form: "a quote character", source: 'val q = \'"\'\nval a = "after it"' },
        { form: "an escaped quote character", source: "val q = '\\''\nval a = \"after it\"" },
        { form: "a unicode character", source: "val q = '\\u0022'\nval a = \"after it\"" },
        { form: "a backticked name", source: 'fun `a " b`() = "after it"' },
        { form: "a number", source: 'val n = 1.5e3.toInt() + 0x1F\nval a = "after it"' },
        { form: "a character left open", source: 'val a = "after it"\nval q = \'' },
        { form: "a backticked name left open", source: 'val a = "after it"\nfun `open' },
    ])("does not open a string at $form", ({ source }) => {
        expect(partsIn(source)).toEqual([["after it"]]);
    });

    it.each([
        {
            call: "a bare function",
            source: 'log("the text")',
            site: { construct: false, callee: "log" },
        },
        {
            call: "a method of a name",
            source: 'log.warn("the text")',
            site: { construct: false, callee: "warn", receiver: "log" },
        },
        {
            call: "a safe call",
            source: 'log?.warn("the text")',
            site: { construct: false, callee: "warn", receiver: "log" },
        },
        {
            call: "a call on a non-null assertion",
            source: 'log!!.warn("the text")',
            site: { construct: false, callee: "warn", receiver: "log" },
        },
        {
            call: "a method of this",
            source: 'this.show("the text")',
            site: { construct: false, callee: "show" },
        },
        {
            call: "a method on a call's result, named by that call's callee",
            source: 'thisLogger().warn("the text")',
            site: { construct: false, callee: "warn", receiver: "thisLogger" },
        },
        {
            call: "a method on the result of a call with arguments and type arguments",
            source: 'logger<A>(b(c)).warn("the text")',
            site: { construct: false, callee: "warn", receiver: "logger" },
        },
        {
            call: "a method on a parenthesized expression",
            source: 'val a = (b + c).show("the text")',
            site: { construct: false, callee: "show" },
        },
        {
            call: "a method on a grouping after a comparison",
            source: 'val a = b > (c).show("the text")',
            site: { construct: false, callee: "show" },
        },
        {
            call: "a method after an unmatched parenthesis",
            source: ').show("the text")',
            site: { construct: false, callee: "show" },
        },
        {
            call: "a callee without a name",
            source: 'handlers[0]("the text")',
            site: { construct: false },
        },
        {
            call: "a call with type arguments",
            source: 'val a = Pair.of<String, List<Int>>("the text")',
            site: { construct: false, callee: "of", receiver: "Pair" },
        },
        {
            call: "a call after a comparison",
            source: 'val a = b > show("the text")',
            site: { construct: false, callee: "show" },
        },
        {
            call: "a call after a class reference",
            source: 'val a = A::class\nshow("the text")',
            site: { construct: false, callee: "show" },
        },
        {
            call: "a thrown constructor",
            source: 'throw IllegalStateException("the text")',
            site: { construct: false, callee: "IllegalStateException", thrown: true },
        },
        {
            call: "a thrown qualified constructor",
            source: 'val a = b ?: throw java.io.IOException("the text")',
            site: { construct: false, callee: "IOException", receiver: "io", thrown: true },
        },
    ])("names the call around an argument: $call", ({ source, site }) => {
        expect(callsAround(source)).toEqual([[site]]);
    });

    it.each([
        { form: "a condition", source: 'if ("the text" == x) { y() }' },
        { form: "a loop", source: 'for (a in listOf()) { b = "the text" }' },
        { form: "a grouping", source: 'val a = ("the text")' },
        { form: "a comparison", source: 'val a = b > ("the text")' },
        { form: "a comparison that starts the source", source: 'b > ("the text")' },
        { form: "a less-than before a call", source: 'val a = b < c && d > ("the text")' },
        {
            form: "a function's parameters and body",
            source: 'fun log(a: String = "the text") { b = "the text" }',
        },
        {
            form: "a generic extension function",
            source: 'fun <T> List<T>.log(a: String = "the text"): Int { b = "the text" }',
        },
        {
            form: "a generic extension function with a bound",
            source: 'fun <T : Any> List<T>.log(a: String = "the text")',
        },
        {
            form: "a generic function whose bound is a function type",
            source: 'fun <T : suspend () -> Unit> log(a: String = "the text")',
        },
        {
            form: "an extension function whose receiver type holds a function type",
            source: 'fun <T> Map<String, (T) -> Unit>.log(a: String = "the text")',
        },
        {
            form: "a class header and body",
            source: 'class A(val t: String = "the text") : B {\n    val c = "the text"\n}',
        },
        { form: "an object body", source: 'object : Runnable { val c = "the text" }' },
        { form: "a bare block", source: 'run { "the text" }' },
        { form: "a lambda after a block", source: 'if (a) { b() } else { "the text" }' },
        { form: "a function type", source: 'val a: (String) -> Unit = { "the text" }' },
        { form: "a trailing lambda", source: 'require(ok) { "the text" }' },
        { form: "a method's lambda", source: 'log.debug { "the text" }' },
        {
            form: "an object passed to a call",
            source: 'log.run(object : R { val a = "the text" })',
        },
    ])("names no call around a literal in $form", ({ source }) => {
        expect(callsAround(source).flat()).toEqual([]);
    });

    it("names only the calls inside the nearest lambda or block: the code a callee runs is no value it is handed", () => {
        expect(
            callsAround(
                'class A : DialogWrapper("the text") {\n' +
                    '    init { logAndRethrow(log) { show("inner text") } }\n' +
                    "}",
            ),
        ).toEqual([
            [{ construct: false, callee: "DialogWrapper" }],
            [{ construct: false, callee: "show" }],
        ]);
    });

    it("ends the calls of a placeholder's lambda at its brace, not at the string", () => {
        expect(callsAround('log.info("Saved ${names.map { "inner text" }}")')).toEqual([
            [{ construct: false, callee: "info", receiver: "log" }],
            [],
        ]);
    });

    it("lists every call around an argument, outermost first, and none around the callee", () => {
        expect(
            callsAround('log.info(format("${read("the key")} text"))\nlookup("a b").show()'),
        ).toEqual([
            [
                { construct: false, callee: "info", receiver: "log" },
                { construct: false, callee: "format" },
            ],
            [
                { construct: false, callee: "info", receiver: "log" },
                { construct: false, callee: "format" },
                { construct: false, callee: "read" },
            ],
            [{ construct: false, callee: "lookup" }],
        ]);
    });

    it("keeps reading after an unbalanced closing bracket", () => {
        expect(callsAround('})\nshow("the text")')).toEqual([
            [{ construct: false, callee: "show" }],
        ]);
    });
});
