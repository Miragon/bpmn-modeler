import type { SourceFile } from "@miragon/architecture-testing";
import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

import { bpmnInlinedLibraries, dmnInlinedLibraries } from "./testing/inlinedLibraries";
import { triggerPaths, workflowPattern } from "./testing/workflowText";

const REPO_ROOT = normalize(join(__dirname, "../../.."));

function readRepoFile(path: string): SourceFile {
    return { path, text: readFileSync(join(REPO_ROOT, path), "utf8") };
}

const markerWorkflow = readRepoFile(".github/workflows/sync-release-markers.yml");

const pushTriggerPaths = triggerPaths(markerWorkflow, "push");

const bpmnInlined = bpmnInlinedLibraries(
    readRepoFile("packages/bpmn-modeler/inlined-libraries.json").text,
);

const dmnInlined = dmnInlinedLibraries(readRepoFile("packages/dmn-modeler/vite.config.mts").text);

describe("release markers for inlined libraries", () => {
    it("reads the inlined libraries of both packages", () => {
        expect(bpmnInlined).toContain("modeler-types");
        expect(dmnInlined).toContain("modeler-types");
    });

    it.each(bpmnInlined)(
        "routes a fix in libs/%s to the VS Code and IntelliJ release lines",
        (directory) => {
            expect(pushTriggerPaths).toContain(`libs/${directory}/**`);
            expect(
                workflowPattern(markerWorkflow, "SPHERE").test(`libs/${directory}/src/index.ts`),
            ).toBe(true);
        },
    );

    it.each([...new Set([...bpmnInlined, ...dmnInlined, "shared"])])(
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

    it.each(dmnInlined)("routes a fix in libs/%s to the DMN modeler release line", (directory) => {
        expect(pushTriggerPaths).toContain(`libs/${directory}/**`);
        expect(
            workflowPattern(markerWorkflow, "DMN_RELEVANT").test(`libs/${directory}/src/index.ts`),
        ).toBe(true);
    });
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
