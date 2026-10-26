import { describe, expect, it } from "vitest";

import { globToRegExp } from "./globToRegExp";

describe("globToRegExp", () => {
    it("matches a leading double-star at the root and across directories", () => {
        const re = globToRegExp("**/*.bpmn");

        expect(re.test("order.bpmn")).toBe(true);
        expect(re.test("processes/sales/order.bpmn")).toBe(true);
        expect(re.test("order.dmn")).toBe(false);
    });

    it("keeps a single star and a question mark within one segment", () => {
        expect(globToRegExp("*.json").test("dir/template.json")).toBe(false);
        expect(globToRegExp("v?.json").test("v2.json")).toBe(true);
        expect(globToRegExp("v?.json").test("v/.json")).toBe(false);
    });

    it("expands brace alternatives", () => {
        const re = globToRegExp("**/*.{form,json}");

        expect(re.test("forms/a.form")).toBe(true);
        expect(re.test("templates/a.json")).toBe(true);
        expect(re.test("a.bpmn")).toBe(false);
    });

    it("treats an unterminated brace and regex characters as literals", () => {
        expect(globToRegExp("a{b.txt").test("a{b.txt")).toBe(true);
        expect(globToRegExp("a+b(1).txt").test("a+b(1).txt")).toBe(true);
        expect(globToRegExp("a.txt").test("abtxt")).toBe(false);
    });

    it("matches a directory exclude anywhere below the root", () => {
        const re = globToRegExp("**/element-templates/**");

        expect(re.test("element-templates/a.json")).toBe(true);
        expect(re.test("project/element-templates/a.json")).toBe(true);
        expect(re.test("project/templates/a.json")).toBe(false);
    });

    it.each([
        ["**/Delegate.java", "Delegate.java", true],
        ["**/Delegate.java", "src/Delegate.java", true],
        ["**/Delegate.java", "src/PaymentDelegate.java", false],
        ["**/element-templates/**", "project/my-element-templates/a.json", false],
    ])(
        "keeps a double-star directory prefix on a path-segment boundary: %s on %s",
        (glob, path, matches) => {
            expect(globToRegExp(glob).test(path)).toBe(matches);
        },
    );
});
