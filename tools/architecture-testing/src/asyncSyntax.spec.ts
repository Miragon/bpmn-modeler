import { describe, expect, it } from "vitest";

import { readAsyncSyntax } from "./asyncSyntax";

describe("readAsyncSyntax", () => {
    it.each([
        ["an async function", "export async function load() {}", "async"],
        ["an async arrow", "export const load = async () => 1;", "async"],
        ["an async function expression", "export const load = async function () {};", "async"],
        ["an async method", "export class Store {\n    async load() {}\n}", "async"],
        ["an async object method", "export const store = { async load() {} };", "async"],
        ["a top-level await", "await Promise.resolve();", "await"],
    ])("finds %s", (_name, text, form) => {
        expect(readAsyncSyntax("domain/x.ts", text).map((found) => found.form)).toEqual([form]);
    });

    it("finds each form with its line", () => {
        const text = [
            "export async function load(items: AsyncIterable<number>) {",
            "    await Promise.resolve();",
            "    for await (const item of items) {",
            "        void item;",
            "    }",
            "}",
        ].join("\n");

        expect(readAsyncSyntax("domain/x.ts", text)).toEqual([
            { form: "async", line: 1 },
            { form: "await", line: 2 },
            { form: "for await", line: 3 },
        ]);
    });

    it("reads no async name in a string, a comment, an identifier or a promise type", () => {
        const text = [
            "// async function load() { await x; }",
            "const pattern = /^\\s*(?:async\\s+)?function/;",
            'const text = "await the result";',
            "export const asyncDebounce = (awaited: Promise<number>) => awaited.then((n) => n + 1);",
            "export type Loader = () => Promise<void>;",
        ].join("\n");

        expect(readAsyncSyntax("domain/x.ts", text)).toEqual([]);
    });
});
