import {
    buildImportGraph,
    type ClassImplementation,
    type SourceFile,
} from "@miragon/architecture-testing";
import { describe, expect, it } from "vitest";

import {
    CONVENTION_COVERAGE_GROUPS,
    conventionCoverageFindings,
} from "./conventionCoverageFindings";
import type { HexagonalWorkspaceSources } from "./hexagonalWorkspaceSources";

const CORE_PORT = "libs/core/src/port/DocumentPort.ts";

function workspace(
    dir: string,
    files: Readonly<Record<string, string>>,
    implementations: readonly ClassImplementation[] = [],
): HexagonalWorkspaceSources {
    const tree: SourceFile[] = Object.entries(files).map(([path, text]) => ({ path, text }));
    return { dir, graph: buildImportGraph(tree), implementations };
}

function implementation(
    path: string,
    className: string,
    interfaceFiles: readonly string[] = [CORE_PORT],
    line = 2,
): ClassImplementation {
    return { path, line, className, interfaceFiles };
}

const CORE_FILES = { "port/DocumentPort.ts": "export interface DocumentPort {}" };

describe("the convention coverage findings", () => {
    it("report each file once per broken convention", () => {
        const core = workspace(
            "libs/core",
            {
                ...CORE_FILES,
                "domain/a.ts": "export const a = 1;",
                "util/b.ts": 'import { a } from "../domain/a";',
                "service/c.ts": '// Shows a message.\nimport * as vscode from "vscode";',
                "service/d.ts": 'import type { DocumentPort } from "../port/DocumentPort";',
                "service/e.ts": [
                    'import type { DocumentPort } from "../port/DocumentPort";',
                    'import * as vscode from "vscode";',
                ].join("\n"),
            },
            [
                implementation("libs/core/src/service/d.ts", "Documents"),
                implementation("libs/core/src/service/e.ts", "VsCodeDocuments", [CORE_PORT], 3),
            ],
        );

        expect(conventionCoverageFindings([core])).toEqual([
            {
                key: "libs/core/src/util/b.ts — every file sits in a role folder or is an entry",
                path: "libs/core/src/util/b.ts",
                line: 1,
                group: "unmapped",
                message: "sits in no role folder and is no entry directly in `src/`",
            },
            {
                key: "libs/core/src/service/c.ts — only adapter/, composition/ and entries import a host module",
                path: "libs/core/src/service/c.ts",
                line: 2,
                group: "divergent-import",
                message:
                    "breaks “only adapter/, composition/ and entries import a host module” by importing `vscode`",
            },
            {
                key: "libs/core/src/service/e.ts — only adapter/, composition/ and entries import a host module",
                path: "libs/core/src/service/e.ts",
                line: 2,
                group: "divergent-import",
                message:
                    "breaks “only adapter/, composition/ and entries import a host module” by importing `vscode`",
            },
            {
                key: "libs/core/src/service/d.ts — implements a port",
                path: "libs/core/src/service/d.ts",
                line: 2,
                group: "misplaced-port-implementation",
                message:
                    "`Documents` implements the port in `libs/core/src/port/DocumentPort.ts` outside adapter/out/ and testing/",
            },
            {
                key: "libs/core/src/service/e.ts — implements a port",
                path: "libs/core/src/service/e.ts",
                line: 3,
                group: "misplaced-port-implementation",
                message:
                    "`VsCodeDocuments` implements the port in `libs/core/src/port/DocumentPort.ts` outside adapter/out/ and testing/",
            },
        ]);
    });

    it("report nothing for a tree that keeps every convention", () => {
        const core = workspace(
            "libs/core",
            {
                ...CORE_FILES,
                "index.ts": 'export { wire } from "./composition/wire";',
                "domain/a.ts": "export const a = 1;",
                "service/s.ts": 'import type { DocumentPort } from "../port/DocumentPort";',
                "adapter/in/command.ts": 'import { s } from "../../service/s";',
                "adapter/out/VsCodeDocuments.ts": [
                    'import * as vscode from "vscode";',
                    'import type { DocumentPort } from "../../port/DocumentPort";',
                ].join("\n"),
                "composition/wire.ts": 'import "../adapter/out/VsCodeDocuments";',
                "testing/FakeDocuments.ts":
                    'import type { DocumentPort } from "../port/DocumentPort";',
            },
            [
                implementation("libs/core/src/adapter/out/VsCodeDocuments.ts", "VsCodeDocuments"),
                implementation("libs/core/src/testing/FakeDocuments.ts", "FakeDocuments"),
                implementation("libs/core/src/service/s.ts", "Settings", [
                    "libs/core/src/service/s.ts",
                ]),
            ],
        );

        expect(conventionCoverageFindings([core])).toEqual([]);
    });

    it("report a port of another workspace implemented outside adapter/out/, also in adapter/in/", () => {
        const core = workspace("libs/core", CORE_FILES);
        const host = workspace(
            "apps/host",
            {
                "adapter/in/Documents.ts": "export class Documents {}",
                "service/Lint.ts": "export class Lint {}",
            },
            [
                implementation("apps/host/src/adapter/in/Documents.ts", "Documents"),
                implementation("apps/host/src/service/Lint.ts", "Lint", [
                    "libs/core/src/domain/LintRule.ts",
                    "libs/shared/src/port/Shared.ts",
                ]),
            ],
        );

        expect(conventionCoverageFindings([core, host])).toEqual([
            expect.objectContaining({
                key: "apps/host/src/adapter/in/Documents.ts — implements a port",
                group: "misplaced-port-implementation",
            }),
        ]);
    });

    it("name every port class of a file and point at the first", () => {
        const core = workspace("libs/core", { ...CORE_FILES, "service/d.ts": "" }, [
            implementation("libs/core/src/service/d.ts", "Later", [CORE_PORT], 9),
            { path: "libs/core/src/service/d.ts", line: 4, interfaceFiles: [CORE_PORT] },
        ]);

        expect(conventionCoverageFindings([core])).toEqual([
            expect.objectContaining({
                line: 4,
                message:
                    "an anonymous class implements the port in `libs/core/src/port/DocumentPort.ts`; `Later` implements the port in `libs/core/src/port/DocumentPort.ts` outside adapter/out/ and testing/",
            }),
        ]);
    });

    it("point at the first import that breaks a rule and name each import it breaks it with", () => {
        const core = workspace("libs/core", {
            ...CORE_FILES,
            "adapter/out/files.ts": "export const files = 1;",
            "domain/a.ts": [
                'import { b } from "./b";',
                'import type { DocumentPort } from "../port/DocumentPort";',
                'import { files } from "../adapter/out/files";',
                'import { t } from "../port/DocumentPort";',
            ].join("\n"),
            "domain/b.ts": "export const b = 1;",
        });

        expect(conventionCoverageFindings([core])).toEqual([
            expect.objectContaining({
                key: "libs/core/src/domain/a.ts — domain/ imports only domain/",
                line: 2,
                message:
                    "breaks “domain/ imports only domain/” by importing `port/DocumentPort.ts`, `adapter/out/files.ts`",
            }),
        ]);
    });

    it("declare every group a finding names, the unmapped files first", () => {
        expect(CONVENTION_COVERAGE_GROUPS.map(({ id }) => id)).toEqual([
            "unmapped",
            "divergent-import",
            "misplaced-port-implementation",
        ]);
    });
});
