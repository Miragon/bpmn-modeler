import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import hostThemeVariables from "./hostThemeVariables.json";

const stylesheet = readFileSync(resolve(__dirname, "default.css"), "utf8");

const reads = [...stylesheet.matchAll(/var\(\s*(--vscode-[\w.-]+)\s*([,)])/g)].map(
    ([, name, after]) => ({ name, hasFallback: after === "," }),
);

/**
 * IntelliJ maps only the variables this list names (PR D reads it in a
 * Kotlin test), and the browser preview maps none: a variable outside the
 * list, or one without a literal fallback, renders unstyled there.
 */
describe("the add-ons view's stylesheet", () => {
    it("follows the host theme", () => {
        expect(reads.map(({ name }) => name)).toEqual(
            expect.arrayContaining(["--vscode-foreground", "--vscode-focusBorder"]),
        );
    });

    it("gives every host variable a literal fallback", () => {
        expect(reads.filter(({ hasFallback }) => !hasFallback).map(({ name }) => name)).toEqual([]);
    });

    it("reads only the host variables hostThemeVariables.json lists", () => {
        const listed = new Set<string>(hostThemeVariables);

        expect(
            [...new Set(reads.map(({ name }) => name))].filter((name) => !listed.has(name)),
        ).toEqual([]);
    });

    it("lists each host variable once", () => {
        expect(hostThemeVariables).toEqual([...new Set(hostThemeVariables)]);
    });

    it("draws focus and high-contrast borders the host's way", () => {
        expect(stylesheet).toContain(":focus-visible");
        expect(stylesheet).toContain("@media (forced-colors: active)");
        expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    });
});
