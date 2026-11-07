import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = normalize(join(__dirname, "../../.."));

function readRepoFile(path: string): string {
    return readFileSync(join(REPO_ROOT, path), "utf8");
}

const markerWorkflow = readRepoFile(".github/workflows/sync-release-markers.yml");

function workflowAssignment(variable: string): string {
    const assignment = new RegExp(`^\\s*${variable}=(?:'([^']+)'|"([^"]+)")$`, "m").exec(
        markerWorkflow,
    );
    if (!assignment) {
        throw new Error(`sync-release-markers.yml assigns no ${variable}`);
    }
    return assignment[1] ?? assignment[2];
}

/** A double-quoted assignment expands `${SPHERE}`, as the workflow's shell does. */
function workflowPattern(variable: string): RegExp {
    return new RegExp(
        workflowAssignment(variable).replace("${SPHERE}", () => workflowAssignment("SPHERE")),
    );
}

function pushTriggerPaths(): string[] {
    const block = /^ {4}paths:\n((?: {6}- '[^']+'\n)+)/m.exec(markerWorkflow);
    if (!block) {
        throw new Error("sync-release-markers.yml has no push paths");
    }
    return [...block[1].matchAll(/- '([^']+)'/g)].map((entry) => entry[1]);
}

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
    JSON.parse(readRepoFile("packages/bpmn-modeler/inlined-libraries.json")) as {
        sourceRoot: string;
    }[]
).map((library) => library.sourceRoot);

const bpmnInlinedLibraries = libraryDirectories(bpmnInlinedSourceRoots);

const dmnInlinedSourceRoots =
    /INLINED_LIB_SRC = \[([^\]]*)\]/.exec(
        readRepoFile("packages/dmn-modeler/vite.config.mts"),
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
            expect(pushTriggerPaths()).toContain(`libs/${directory}/**`);
            expect(workflowPattern("SPHERE").test(`libs/${directory}/src/index.ts`)).toBe(true);
        },
    );

    it.each([...new Set([...bpmnInlinedLibraries, ...dmnInlinedLibraries, "shared"])])(
        "routes a fix in libs/%s to the Orca plugin's release line",
        (directory) => {
            expect(pushTriggerPaths()).toContain(`libs/${directory}/**`);
            expect(workflowPattern("ORCA_RELEVANT").test(`libs/${directory}/src/index.ts`)).toBe(
                true,
            );
        },
    );

    it.each(["bpmn-modeler", "dmn-modeler"])(
        "routes a fix in packages/%s to the Orca plugin's release line",
        (directory) => {
            expect(pushTriggerPaths()).toContain(`packages/${directory}/**`);
            expect(
                workflowPattern("ORCA_RELEVANT").test(`packages/${directory}/src/index.ts`),
            ).toBe(true);
        },
    );

    it.each(dmnInlinedLibraries)(
        "routes a fix in libs/%s to the DMN modeler release line",
        (directory) => {
            expect(pushTriggerPaths()).toContain(`libs/${directory}/**`);
            expect(workflowPattern("DMN_RELEVANT").test(`libs/${directory}/src/index.ts`)).toBe(
                true,
            );
        },
    );
});
