import { describe, expect, it } from "vitest";

import { findImplementations } from "./implementations";
import type { SourceFile } from "./sourceTree";

const PORT: SourceFile = {
    path: "core/port/DocumentPort.ts",
    text: "export interface DocumentPort {}\nexport interface SavePort {}",
};

function implementationsIn(text: string, tree: readonly SourceFile[] = [PORT]) {
    return findImplementations([...tree, { path: "core/service/Documents.ts", text }]);
}

describe("findImplementations", () => {
    it.each([
        {
            form: "a named import",
            source: 'import type { DocumentPort } from "../port/DocumentPort";\nclass A implements DocumentPort {}',
        },
        {
            form: "a renamed import",
            source: 'import { DocumentPort as Port } from "../port/DocumentPort";\nclass A implements Port {}',
        },
        {
            form: "a namespace import",
            source: 'import * as ports from "../port/DocumentPort";\nclass A implements ports.DocumentPort {}',
        },
        {
            form: "a generic interface",
            source: 'import { DocumentPort } from "../port/DocumentPort";\nclass A implements DocumentPort<string> {}',
        },
    ])("resolves $form to the declaring file", ({ source }) => {
        expect(implementationsIn(source)).toEqual([
            {
                path: "core/service/Documents.ts",
                line: 2,
                className: "A",
                interfaceFiles: ["core/port/DocumentPort.ts"],
                constructedIn: [],
                receivedIn: [],
            },
        ]);
    });

    it("follows barrels and path aliases to the declaring file", () => {
        const tree: SourceFile[] = [
            PORT,
            { path: "core/index.ts", text: 'export * from "./port/barrel";' },
            { path: "core/port/barrel.ts", text: 'export { DocumentPort } from "./DocumentPort";' },
            {
                path: "host/adapter/out/Documents.ts",
                text: 'import { DocumentPort } from "@scope/core";\nexport class Documents implements DocumentPort {}',
            },
        ];

        expect(
            findImplementations(tree, {
                aliases: [{ pattern: "@scope/core", targets: ["core/index.ts"] }],
            }),
        ).toEqual([
            {
                path: "host/adapter/out/Documents.ts",
                line: 2,
                className: "Documents",
                interfaceFiles: ["core/port/DocumentPort.ts"],
                constructedIn: [],
                receivedIn: [],
            },
        ]);
    });

    it("resolves a locally declared interface to the file itself", () => {
        expect(implementationsIn("interface Local {}\nclass A implements Local {}")).toEqual([
            {
                path: "core/service/Documents.ts",
                line: 2,
                className: "A",
                interfaceFiles: ["core/service/Documents.ts"],
                constructedIn: [],
                receivedIn: [],
            },
        ]);
    });

    it.each([
        { form: "a global interface", source: "class A implements Disposable {}" },
        {
            form: "an interface from a package",
            source: 'import type { Disposable } from "vscode";\nclass A implements Disposable {}',
        },
        {
            form: "an import that resolves to no file",
            source: 'import type { Gone } from "../port/Gone";\nclass A implements Gone {}',
        },
        {
            form: "a namespace member of a package",
            source: 'import * as vscode from "vscode";\nclass A implements vscode.Disposable {}',
        },
        {
            form: "a member of a named import",
            source: 'import { ports } from "../port/DocumentPort";\nclass A implements ports.DocumentPort {}',
        },
        {
            form: "a deeper qualified name",
            source: 'import * as core from "../port/DocumentPort";\nclass A implements core.ports.DocumentPort {}',
        },
        {
            form: "a namespace import used as the interface",
            source: 'import * as DocumentPort from "../port/DocumentPort";\nclass A implements DocumentPort {}',
        },
    ])("resolves $form to no file", ({ source }) => {
        expect(implementationsIn(source)).toEqual([
            expect.objectContaining({ className: "A", interfaceFiles: [] }),
        ]);
    });

    it("lists each declaring file once, sorted, for a class implementing several interfaces", () => {
        const source = [
            'import type { SavePort, DocumentPort } from "../port/DocumentPort";',
            "interface Local {}",
            "class A implements SavePort, Local, DocumentPort, Disposable {}",
        ].join("\n");

        expect(implementationsIn(source)).toEqual([
            expect.objectContaining({
                interfaceFiles: ["core/port/DocumentPort.ts", "core/service/Documents.ts"],
            }),
        ]);
    });

    it("reads the line a class starts on and leaves an anonymous class unnamed", () => {
        const source = [
            'import type { DocumentPort } from "../port/DocumentPort";',
            "/** Header. */",
            "export class A",
            "    extends Base",
            "    implements DocumentPort {}",
            "const b = new (class implements DocumentPort {})();",
        ].join("\n");

        expect(implementationsIn(source)).toEqual([
            expect.objectContaining({ line: 3, className: "A" }),
            {
                path: "core/service/Documents.ts",
                line: 6,
                interfaceFiles: ["core/port/DocumentPort.ts"],
                constructedIn: ["core/service/Documents.ts"],
                receivedIn: [],
            },
        ]);
    });

    it("lists each file that builds a class, through imports, barrels, aliases and namespaces", () => {
        const tree: SourceFile[] = [
            PORT,
            {
                path: "core/service/Surface.ts",
                text: [
                    'import type { DocumentPort } from "../port/DocumentPort";',
                    "export class Surface implements DocumentPort {}",
                    "export class Other implements DocumentPort {}",
                    "export const own = new Surface();",
                ].join("\n"),
            },
            { path: "core/index.ts", text: 'export * from "./service/Surface";' },
            {
                path: "core/service/View.ts",
                text: 'import { Surface as Renamed } from "./Surface";\nnew Renamed();',
            },
            {
                path: "host/composition/wire.ts",
                text: 'import * as core from "@scope/core";\nnew core.Surface();',
            },
            {
                path: "host/composition/other.ts",
                text: 'import { Surface } from "@scope/missing";\nnew Surface();\nnew Unknown();\nnew (factory())();',
            },
        ];

        expect(
            findImplementations(tree, {
                aliases: [{ pattern: "@scope/core", targets: ["core/index.ts"] }],
            }),
        ).toEqual([
            expect.objectContaining({
                className: "Surface",
                constructedIn: [
                    "core/service/Surface.ts",
                    "core/service/View.ts",
                    "host/composition/wire.ts",
                ],
            }),
            expect.objectContaining({ className: "Other", constructedIn: [] }),
        ]);
    });

    it("lists each file with a parameter typed by an implemented interface, a default or an optional one included", () => {
        const tree: SourceFile[] = [
            PORT,
            {
                path: "core/service/SystemDocuments.ts",
                text: 'import type { DocumentPort } from "../port/DocumentPort";\nexport class SystemDocuments implements DocumentPort {}',
            },
            {
                path: "core/service/Scheduler.ts",
                text: [
                    'import type { DocumentPort } from "../port/DocumentPort";',
                    'import { SystemDocuments } from "./SystemDocuments";',
                    "export class Scheduler {",
                    "    constructor(private readonly documents: DocumentPort = new SystemDocuments()) {}",
                    "}",
                ].join("\n"),
            },
            {
                path: "core/service/locate.ts",
                text: [
                    'import * as ports from "../port/DocumentPort";',
                    "export const locate = (options: { documents?: ports.DocumentPort | undefined }) => options;",
                ].join("\n"),
            },
            {
                path: "core/service/Other.ts",
                text: [
                    'import type { DocumentPort, SavePort } from "../port/DocumentPort";',
                    "export function save(port: SavePort): DocumentPort {",
                    "    return port as unknown as DocumentPort;",
                    "}",
                    "export class Holder { documents?: DocumentPort; }",
                ].join("\n"),
            },
        ];

        expect(findImplementations(tree)).toEqual([
            expect.objectContaining({
                className: "SystemDocuments",
                constructedIn: ["core/service/Scheduler.ts"],
                receivedIn: ["core/service/Scheduler.ts", "core/service/locate.ts"],
            }),
        ]);
    });

    it.each([
        { form: "a class without heritage", source: "class A {}" },
        { form: "a class that only extends", source: "class A extends Base {}" },
        {
            form: "a class in a comment or a string",
            source: '// class A implements B {}\nconst text = "class C implements D {}";',
        },
        { form: "an interface extending an interface", source: "interface A extends B {}" },
    ])("lists no $form", ({ source }) => {
        expect(implementationsIn(source)).toEqual([]);
    });
});
