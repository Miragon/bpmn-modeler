import type { SourceFile } from "@miragon/architecture-testing";
import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

import { triggerPaths, workflowPattern } from "./testing/workflowText";

const REPO_ROOT = normalize(join(__dirname, "../../.."));

function readRepoFile(path: string): SourceFile {
    return { path, text: readFileSync(join(REPO_ROOT, path), "utf8") };
}

const markerWorkflow = readRepoFile(".github/workflows/sync-release-markers.yml");

const pushTriggerPaths = triggerPaths(markerWorkflow, "push");

function libraryDirectories(sourceRoots: string[]): string[] {
    return sourceRoots.map((sourceRoot) => {
        const directory = /^\.\.\/\.\.\/libs\/([^/]+)\/src$/.exec(sourceRoot)?.[1];
        if (!directory) {
            throw new Error(`unexpected inlined library source root ${sourceRoot}`);
        }
        return directory;
    });
}

const bpmnInlinedSourceRoots = (
    JSON.parse(readRepoFile("packages/bpmn-modeler/inlined-libraries.json").text) as {
        sourceRoot: string;
    }[]
).map((library) => library.sourceRoot);

const bpmnInlinedLibraries = libraryDirectories(bpmnInlinedSourceRoots);

const dmnInlinedSourceRoots =
    /INLINED_LIB_SRC = \[([^\]]*)\]/.exec(
        readRepoFile("packages/dmn-modeler/vite.config.mts").text,
    )?.[1] ?? "";

const dmnInlinedLibraries = libraryDirectories(
    [...dmnInlinedSourceRoots.matchAll(/"([^"]+)"/g)].map((entry) => entry[1]),
);

describe("release markers for inlined libraries", () => {
    it("reads the inlined libraries of both packages", () => {
        expect(bpmnInlinedLibraries).toContain("modeler-types");
        expect(dmnInlinedLibraries).toContain("modeler-types");
    });

    it.each(bpmnInlinedLibraries)(
        "routes a fix in libs/%s to the VS Code and IntelliJ release lines",
        (directory) => {
            expect(pushTriggerPaths).toContain(`libs/${directory}/**`);
            expect(
                workflowPattern(markerWorkflow, "SPHERE").test(`libs/${directory}/src/index.ts`),
            ).toBe(true);
        },
    );

    it.each([...new Set([...bpmnInlinedLibraries, ...dmnInlinedLibraries, "shared"])])(
        "routes a fix in libs/%s to the Orca plugin's release line",
        (directory) => {
            expect(pushTriggerPaths).toContain(`libs/${directory}/**`);
            expect(
                workflowPattern(markerWorkflow, "ORCA_RELEVANT").test(
                    `libs/${directory}/src/index.ts`,
                ),
            ).toBe(true);
        },
    );

    it.each(["bpmn-modeler", "dmn-modeler"])(
        "routes a fix in packages/%s to the Orca plugin's release line",
        (directory) => {
            expect(pushTriggerPaths).toContain(`packages/${directory}/**`);
            expect(
                workflowPattern(markerWorkflow, "ORCA_RELEVANT").test(
                    `packages/${directory}/src/index.ts`,
                ),
            ).toBe(true);
        },
    );

    it.each(dmnInlinedLibraries)(
        "routes a fix in libs/%s to the DMN modeler release line",
        (directory) => {
            expect(pushTriggerPaths).toContain(`libs/${directory}/**`);
            expect(
                workflowPattern(markerWorkflow, "DMN_RELEVANT").test(
                    `libs/${directory}/src/index.ts`,
                ),
            ).toBe(true);
        },
    );
});

describe("release markers for the modeler bundle preset", () => {
    it.each(["VSC_RELEVANT", "IJ_RELEVANT", "ORCA_RELEVANT"])(
        "routes a fix in vite.shared.ts to the %s host line",
        (variable) => {
            expect(pushTriggerPaths).toContain("vite.shared.ts");
            expect(workflowPattern(markerWorkflow, variable).test("vite.shared.ts")).toBe(true);
        },
    );
});
