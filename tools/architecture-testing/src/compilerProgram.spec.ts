import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { compilesWithDom } from "./compilerProgram";

describe("compilesWithDom", () => {
    let root: string;

    const write = (path: string, content: object | string): void => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(
            join(root, path),
            typeof content === "string" ? content : JSON.stringify(content),
        );
    };

    const withSource = (dir: string, text = "export const x = 1;"): void => {
        write(`${dir}/src/index.ts`, text);
    };

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "compiler-program-"));
        write("tsconfig.base.json", { compilerOptions: { lib: ["ES2021", "DOM"] } });
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it("reads a workspace whose tsconfig inherits the DOM lib as DOM", () => {
        write("libs/shared/tsconfig.json", { extends: "../../tsconfig.base.json" });
        withSource("libs/shared");

        expect(compilesWithDom(join(root, "libs/shared"))).toBe(true);
    });

    it("reads a lib without the DOM set over the inherited one as DOM-free", () => {
        write("libs/merge/tsconfig.json", {
            extends: "../../tsconfig.base.json",
            compilerOptions: { lib: ["ES2021"] },
        });
        withSource("libs/merge");

        expect(compilesWithDom(join(root, "libs/merge"))).toBe(false);
    });

    it("reads a tsconfig that names no lib as DOM: TypeScript's default lib holds it", () => {
        write("libs/plain/tsconfig.json", { compilerOptions: { strict: true } });
        withSource("libs/plain");

        expect(compilesWithDom(join(root, "libs/plain"))).toBe(true);
    });

    it("reads a workspace without a tsconfig as DOM, as no compile proves otherwise", () => {
        withSource("docs");

        expect(compilesWithDom(join(root, "docs"))).toBe(true);
    });

    it("reads the DOM a loaded declaration adds with a lib reference, as preact's JSX types do", () => {
        write("libs/merge/tsconfig.json", {
            extends: "../../tsconfig.base.json",
            compilerOptions: { lib: ["ES2021"] },
        });
        withSource("libs/merge", 'import type { Props } from "./jsx";\nexport type P = Props;');
        write("libs/merge/src/jsx.d.ts", '/// <reference lib="dom" />\nexport type Props = {};');

        expect(compilesWithDom(join(root, "libs/merge"))).toBe(true);
    });

    it("reads the DOM of a config a solution tsconfig references", () => {
        write("libs/core/tsconfig.json", {
            compilerOptions: { lib: ["ES2021"] },
            files: [],
            references: [{ path: "./tsconfig.lib.json" }],
        });
        write("libs/core/tsconfig.lib.json", {
            extends: "./tsconfig.json",
            compilerOptions: { lib: ["ES2021", "DOM"] },
            include: ["src/**/*.ts"],
        });
        withSource("libs/core");

        expect(compilesWithDom(join(root, "libs/core"))).toBe(true);
    });

    it("reads a solution whose referenced configs leave the DOM out as DOM-free", () => {
        write("libs/core/tsconfig.json", {
            compilerOptions: { lib: ["ES2021"] },
            files: [],
            references: [{ path: "./lib" }],
        });
        write("libs/core/lib/tsconfig.json", {
            extends: "../tsconfig.json",
            include: ["../src/**/*.ts"],
        });
        withSource("libs/core");

        expect(compilesWithDom(join(root, "libs/core"))).toBe(false);
    });

    it("reads a tsconfig the compiler refuses as DOM, as no compile proves otherwise", () => {
        write("libs/broken/tsconfig.json", {
            compilerOptions: { lib: ["ES2021"] },
            include: ["scripts/**/*.ts"],
        });
        withSource("libs/broken");

        expect(compilesWithDom(join(root, "libs/broken"))).toBe(true);
    });
});
