import { describe, expect, it } from "vitest";

import { readKotlinInitializedValues } from "./kotlinInitializedValues";

describe("readKotlinInitializedValues", () => {
    it.each([
        {
            declaration: "a property",
            source: "class A {\n    private val log = Logger.getInstance(A::class.java)\n}",
            values: [{ name: "log", initializer: "Logger.getInstance" }],
        },
        {
            declaration: "a top-level var",
            source: 'private var log = Logger.getInstance("io.x.A")',
            values: [{ name: "log", initializer: "Logger.getInstance" }],
        },
        {
            declaration: "a companion's property",
            source: "class A {\n    companion object {\n        private val LOG = Logger.getInstance(A::class.java)\n    }\n}",
            values: [{ name: "LOG", initializer: "Logger.getInstance" }],
        },
        {
            declaration: "a constructor property's default, after its type",
            source: [
                "class A(",
                "    private val project: Project,",
                "    private val log: Logger = Logger.getInstance(A::class.java),",
                ")",
            ].join("\n"),
            values: [{ name: "log", initializer: "Logger.getInstance" }],
        },
        {
            declaration: "a fully qualified call",
            source: "val log = com.intellij.openapi.diagnostic.Logger.getInstance(A::class.java)",
            values: [
                {
                    name: "log",
                    initializer: "com.intellij.openapi.diagnostic.Logger.getInstance",
                },
            ],
        },
        {
            declaration: "a generic type and a call with type arguments",
            source: "val byId: Map<String, List<Int>> = mutableMapOf<String, List<Int>>()",
            values: [{ name: "byId", initializer: "mutableMapOf" }],
        },
        {
            declaration: "a call whose argument compares",
            source: "val first = pick(a < b, c)",
            values: [{ name: "first", initializer: "pick" }],
        },
        {
            declaration: "a function type",
            source: "val onSave: (String) -> Unit = handlerFor(file)",
            values: [{ name: "onSave", initializer: "handlerFor" }],
        },
    ])("reads $declaration", ({ source, values }) => {
        expect(readKotlinInitializedValues(source)).toEqual(values);
    });

    it.each([
        { declaration: "a value that is no call", source: "val count = 3\nval name = other.name" },
        {
            declaration: "a call on a call's result",
            source: "val log = Logger.getInstance(A::class.java).child()",
        },
        {
            declaration: "a delegated property",
            source: "val log by lazy { Logger.getInstance(A::class.java) }",
        },
        { declaration: "a destructuring declaration", source: "val (a, b) = pairOf()" },
        { declaration: "an if expression", source: "val a = if (ready) start() else stop()" },
        {
            declaration: "a typed value without an initializer before a function on the next line",
            source: "abstract val log: Logger\nfun create() = Logger.getInstance(A::class.java)",
        },
        {
            declaration: "a declaration inside a string",
            source: 'val text = "val log = Logger.getInstance(A)"',
        },
        {
            declaration: "a constructor property without a default",
            source: "class A(val project: Project)",
        },
        {
            declaration: "a typed value at the end of the source",
            source: "abstract val log: Logger",
        },
        {
            declaration: "a call the source never closes",
            source: "val log = Logger.getInstance(A::class.java",
        },
    ])("reads no value from $declaration", ({ source }) => {
        expect(readKotlinInitializedValues(source)).toEqual([]);
    });
});
