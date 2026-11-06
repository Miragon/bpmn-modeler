import { buildImportGraph } from "@miragon/architecture-testing";
import { describe, expect, it } from "vitest";

import { InsufficientHistory } from "../../fitness/domain/fitnessFunction";
import { measure } from "../../fitness/service/measurement";
import type { HexagonalWorkspaceSources } from "../domain/hexagonalWorkspaceSources";
import type { RoleFolderSources } from "../port/RoleFolderSources";
import { createConventionCoverageFitnessFunction } from "./conventionCoverageFitnessFunction";

class InMemoryRoleFolderSources implements RoleFolderSources {
    readonly reads: string[] = [];

    constructor(private readonly workspaces: readonly HexagonalWorkspaceSources[]) {}

    read(repoRoot: string): readonly HexagonalWorkspaceSources[] {
        this.reads.push(repoRoot);
        return this.workspaces;
    }
}

const CONTEXT = { repoRoot: "/repo", commit: "head", changeBase: "head" };

describe("the convention coverage fitness function", () => {
    it("reports the files of the measured tree that break a convention", () => {
        const sources = new InMemoryRoleFolderSources([
            {
                dir: "libs/core",
                graph: buildImportGraph([
                    { path: "util/b.ts", text: "" },
                    { path: "service/c.ts", text: 'import * as vscode from "vscode";' },
                    { path: "port/DocumentPort.ts", text: "export interface DocumentPort {}" },
                ]),
                implementations: [
                    {
                        path: "libs/core/src/service/c.ts",
                        line: 1,
                        className: "Documents",
                        interfaceFiles: ["libs/core/src/port/DocumentPort.ts"],
                    },
                ],
            },
        ]);

        const measurement = measure(createConventionCoverageFitnessFunction({ sources }), CONTEXT);

        expect(sources.reads).toEqual(["/repo"]);
        expect(measurement).toEqual({
            findings: [
                expect.objectContaining({
                    path: "libs/core/src/service/c.ts",
                    group: "misplaced-port-implementation",
                }),
                expect.objectContaining({
                    path: "libs/core/src/service/c.ts",
                    group: "divergent-import",
                }),
                expect.objectContaining({ path: "libs/core/src/util/b.ts", group: "unmapped" }),
            ],
        });
    });

    it("ends its series where no workspace declares the hexagonal architecture", () => {
        const fitnessFunction = createConventionCoverageFitnessFunction({
            sources: new InMemoryRoleFolderSources([]),
        });

        expect(() => fitnessFunction.findFindings(CONTEXT)).toThrow(InsufficientHistory);
        expect(measure(fitnessFunction, CONTEXT)).toEqual({
            unmeasurable: 'no workspace manifest declares "architecture": "hexagonal"',
        });
    });
});
