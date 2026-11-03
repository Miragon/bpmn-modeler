import { describe, expect, it } from "vitest";

import { buildDeclarationGraph } from "./declarationGraph";
import type { PathAlias } from "./pathAliases";
import type { SourceFile } from "./sourceTree";

const CORE_ALIASES: readonly PathAlias[] = [
    { pattern: "@scope/core", targets: ["libs/core/src/index.ts"] },
    { pattern: "@scope/panel/*", targets: ["libs/panel/src/*"] },
];

function targetsOf(tree: readonly SourceFile[], from: string, dataFiles: string[] = []): string[] {
    return buildDeclarationGraph(tree, { aliases: CORE_ALIASES, dataFiles })
        .filter((edge) => edge.from === from)
        .map(({ to }) => to);
}

const CORE: readonly SourceFile[] = [
    { path: "libs/core/src/index.ts", text: 'export * from "./kernel";\nexport * from "./lint";' },
    {
        path: "libs/core/src/kernel/index.ts",
        text: 'export * from "./port/hostPorts";\nexport { Document as BpmnDocument } from "./domain/Document";',
    },
    { path: "libs/core/src/kernel/port/hostPorts.ts", text: "export interface StatusBar {}" },
    { path: "libs/core/src/kernel/domain/Document.ts", text: "export class Document {}" },
    {
        path: "libs/core/src/lint/index.ts",
        text: 'import Service from "./LintService";\nexport { Service as LintService };\nexport * from "../kernel";',
    },
    { path: "libs/core/src/lint/LintService.ts", text: "export default class LintService {}" },
];

describe("buildDeclarationGraph", () => {
    it("links an alias import to the file that declares the name, through export * chains", () => {
        const adapter = {
            path: "apps/host/src/adapter/out/StatusBar.ts",
            text: 'import type { StatusBar } from "@scope/core";',
        };

        expect(targetsOf([...CORE, adapter], adapter.path)).toEqual([
            "libs/core/src/kernel/port/hostPorts.ts",
        ]);
    });

    it.each([
        {
            form: "a renamed re-export",
            name: "BpmnDocument",
            to: "libs/core/src/kernel/domain/Document.ts",
        },
        {
            form: "a local re-export of a default import",
            name: "LintService",
            to: "libs/core/src/lint/LintService.ts",
        },
    ])("follows $form", ({ name, to }) => {
        const consumer = {
            path: "apps/host/src/a.ts",
            text: `import { ${name} } from "@scope/core";`,
        };

        expect(targetsOf([...CORE, consumer], consumer.path)).toEqual([to]);
    });

    it("links a default import to the module", () => {
        const consumer = {
            path: "libs/core/src/lint/view.ts",
            text: 'import LintService from "./LintService";',
        };

        expect(targetsOf([...CORE, consumer], consumer.path)).toEqual([
            "libs/core/src/lint/LintService.ts",
        ]);
    });

    it("links a namespace import of a barrel to every file the barrel reaches", () => {
        const consumer = {
            path: "apps/host/src/a.ts",
            text: 'import * as core from "@scope/core";',
        };

        expect(targetsOf([...CORE, consumer], consumer.path)).toEqual([
            "libs/core/src/kernel/domain/Document.ts",
            "libs/core/src/kernel/port/hostPorts.ts",
            "libs/core/src/lint/LintService.ts",
        ]);
    });

    it("links a dynamic import of a module that declares to that module", () => {
        const consumer = {
            path: "libs/core/src/lint/view.ts",
            text: 'const service = import("./LintService");',
        };

        expect(targetsOf([...CORE, consumer], consumer.path)).toEqual([
            "libs/core/src/lint/LintService.ts",
        ]);
    });

    it("links an import of a mixed index's own declaration to the index, and its re-exports onward", () => {
        const tree = [
            {
                path: "libs/menu/src/index.ts",
                text: 'export { entry } from "./catalog";\nexport const MenuModule = {};',
            },
            { path: "libs/menu/src/catalog.ts", text: "export const entry = 1;" },
            {
                path: "libs/menu/src/view/a.ts",
                text: 'import { MenuModule, entry } from "../index";',
            },
        ];

        expect(targetsOf(tree, "libs/menu/src/view/a.ts")).toEqual([
            "libs/menu/src/catalog.ts",
            "libs/menu/src/index.ts",
        ]);
        expect(targetsOf(tree, "libs/menu/src/index.ts")).toEqual(["libs/menu/src/catalog.ts"]);
    });

    it("links an import of a name a module re-exports to the module as well, unless it is a barrel", () => {
        const tree = [
            {
                path: "src/publicApi.ts",
                text: 'export type { ThemeMode } from "./themeMode";\nexport interface Options {}',
            },
            { path: "src/themeMode.ts", text: 'export type ThemeMode = "light";' },
            {
                path: "src/design/designer.ts",
                text: 'import type { ThemeMode } from "../publicApi";',
            },
        ];

        expect(targetsOf(tree, "src/design/designer.ts")).toEqual([
            "src/publicApi.ts",
            "src/themeMode.ts",
        ]);
    });

    it("resolves a wildcard alias", () => {
        const tree = [
            { path: "libs/panel/src/entries/Group.tsx", text: "export function Group() {}" },
            {
                path: "apps/host/src/a.ts",
                text: 'import { Group } from "@scope/panel/entries/Group";',
            },
        ];

        expect(targetsOf(tree, "apps/host/src/a.ts")).toEqual(["libs/panel/src/entries/Group.tsx"]);
    });

    it.each([
        { form: "a default import", source: 'import schema from "./targets.schema.json";' },
        { form: "a namespace import", source: 'import * as schema from "./targets.schema.json";' },
    ])("links $form of a JSON file to the JSON file", ({ source }) => {
        const consumer = { path: "libs/shared/src/targets.ts", text: source };

        expect(
            targetsOf([consumer], consumer.path, ["libs/shared/src/targets.schema.json"]),
        ).toEqual(["libs/shared/src/targets.schema.json"]);
    });

    it.each([
        { form: "a name no file declares", source: 'import { missing } from "@scope/core";' },
        {
            form: "a name re-exported from a package",
            source: 'import { Modeler } from "@scope/core";',
        },
        {
            form: "a default import, which export * does not pass on",
            source: 'import a from "@scope/core";',
        },
    ])("falls back to the module for $form", ({ source }) => {
        const tree = [
            {
                path: "libs/core/src/index.ts",
                text: 'export * from "./a";\nexport { Modeler } from "bpmn-js";',
            },
            { path: "libs/core/src/a.ts", text: "export const a = 1;\nexport default a;" },
            { path: "apps/host/src/b.ts", text: source },
        ];

        expect(targetsOf(tree, "apps/host/src/b.ts")).toEqual(["libs/core/src/index.ts"]);
    });

    it("stops at a cycle of re-exports and falls back to the module", () => {
        const tree = [
            { path: "a.ts", text: 'export * from "./b";' },
            { path: "b.ts", text: 'export * from "./a";\nexport { x } from "./a";' },
            { path: "c.ts", text: 'import { x } from "./a";\nimport * as all from "./b";' },
        ];

        expect(targetsOf(tree, "c.ts")).toEqual(["a.ts"]);
    });

    it("draws no edge for a package, an unresolved file or the file itself", () => {
        const tree = [
            {
                path: "a.ts",
                text: 'import { x } from "bpmn-js";\nimport "./missing";\nexport * from "./missing";\nimport { a } from "./a";\nexport const a = 1;',
            },
        ];

        expect(targetsOf(tree, "a.ts")).toEqual([]);
    });

    it("links a namespace import of a barrel that reaches no file to the barrel", () => {
        const tree = [
            {
                path: "index.ts",
                text: 'export * from "./missing";\nexport * as x from "./gone";\nexport { y } from "./gone";',
            },
            { path: "a.ts", text: 'import * as all from "./index";\nimport { z } from "./index";' },
        ];

        expect(targetsOf(tree, "a.ts")).toEqual(["index.ts"]);
    });

    it("draws one edge per pair", () => {
        const tree = [
            { path: "a.ts", text: "export const a = 1, b = 2;" },
            { path: "c.ts", text: 'import { a } from "./a";\nimport { b } from "./a";' },
        ];

        expect(targetsOf(tree, "c.ts")).toEqual(["a.ts"]);
    });
});
