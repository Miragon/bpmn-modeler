import { describe, expect, it } from "vitest";

import { readModuleImports } from "./moduleImports";

describe("readModuleImports", () => {
    it.each([
        { form: "a static import", source: 'import { a } from "./a";', typeOnly: false },
        { form: "a type-only import", source: 'import type { A } from "./a";', typeOnly: true },
        {
            form: "an import whose every binding is a type",
            source: 'import { type A, type B } from "./a";',
            typeOnly: true,
        },
        {
            form: "an import that mixes a type and a value binding",
            source: 'import { type A, b } from "./a";',
            typeOnly: false,
        },
        {
            form: "a default import beside a type binding",
            source: 'import a, { type B } from "./a";',
            typeOnly: false,
        },
        {
            form: "a namespace import",
            source: 'import * as a from "./a";',
            typeOnly: false,
        },
        { form: "a re-export", source: 'export { a } from "./a";', typeOnly: false },
        { form: "a type re-export", source: 'export type { A } from "./a";', typeOnly: true },
        {
            form: "a re-export whose every binding is a type",
            source: 'export { type A } from "./a";',
            typeOnly: true,
        },
        { form: "a star re-export", source: 'export * from "./a";', typeOnly: false },
        { form: "a namespace re-export", source: 'export * as a from "./a";', typeOnly: false },
        {
            form: "a type namespace re-export",
            source: 'export type * as A from "./a";',
            typeOnly: true,
        },
        {
            form: "a deferred namespace import",
            source: 'import defer * as a from "./a";',
            typeOnly: false,
        },
        { form: "a side-effect import", source: 'import "./a";', typeOnly: false },
        { form: "a dynamic import", source: 'const a = import("./a");', typeOnly: false },
        { form: "a require call", source: 'const a = require("./a");', typeOnly: false },
        { form: "an import-equals require", source: 'import a = require("./a");', typeOnly: false },
        {
            form: "a type import-equals require",
            source: 'import type a = require("./a");',
            typeOnly: true,
        },
        { form: "an import type", source: 'type A = import("./a").A;', typeOnly: true },
        {
            form: "a typeof import type",
            source: 'let a: typeof import("./a");',
            typeOnly: true,
        },
    ])("reads $form", ({ source, typeOnly }) => {
        expect(readModuleImports("module.ts", source)).toEqual([{ specifier: "./a", typeOnly }]);
    });

    it.each([
        {
            form: "an import() inside a JSDoc link",
            source: '/** {@link import("../x").Y} */\nimport { a } from "./a";',
        },
        {
            form: "a commented-out import",
            source: '// import { x } from "./x";\nimport { a } from "./a";',
        },
        {
            form: "an import inside a string",
            source: 'const text = \'import { x } from "./x"\';\nimport { a } from "./a";',
        },
        {
            form: "a call to a function other than require",
            source: 'const label = translate("./x");\nimport { a } from "./a";',
        },
        {
            form: "a dynamic import of a computed path",
            source: 'const x = import(modulePath);\nimport { a } from "./a";',
        },
    ])("ignores $form", ({ source }) => {
        expect(readModuleImports("module.ts", source)).toEqual([
            { specifier: "./a", typeOnly: false },
        ]);
    });

    it("lists imports in source order", () => {
        const source = 'import "./b";\nimport type { A } from "./a";\nconst c = require("./c");';

        expect(readModuleImports("module.ts", source).map(({ specifier }) => specifier)).toEqual([
            "./b",
            "./a",
            "./c",
        ]);
    });

    it("reads JSX text in a .tsx file as text, not as an import", () => {
        const source = 'const view = <p>import "./x";</p>;\nimport { a } from "./a";';

        expect(readModuleImports("view.tsx", source)).toEqual([
            { specifier: "./a", typeOnly: false },
        ]);
    });
});
