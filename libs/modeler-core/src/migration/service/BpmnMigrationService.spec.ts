import { describe, expect, it, vi } from "vitest";

import { createTestHost, TestHostOptions } from "../../testing";
import { BpmnMigrationService } from "./BpmnMigrationService";

// ─── Sample BPMN XML ────────────────────────────────────────────────────────

const c7Bpmn = (version: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  xmlns:modeler="http://camunda.org/schema/modeler/1.0"
  modeler:executionPlatform="Camunda Platform"
  modeler:executionPlatformVersion="${version}">
</bpmn:definitions>`;

const c8Bpmn = (version: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
  xmlns:modeler="http://camunda.org/schema/modeler/1.0"
  modeler:executionPlatform="Camunda Cloud"
  modeler:executionPlatformVersion="${version}">
</bpmn:definitions>`;

const c8BpmnNoVersion = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
  xmlns:modeler="http://camunda.org/schema/modeler/1.0">
</bpmn:definitions>`;

const unknownBpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:modeler="http://camunda.org/schema/modeler/1.0">
</bpmn:definitions>`;

// ─── Host ───────────────────────────────────────────────────────────────────

function createHost(files: Record<string, string>, answers: TestHostOptions["answers"] = {}) {
    const host = createTestHost({ folders: ["/work"], files, answers });
    const service = new BpmnMigrationService(
        host.store,
        host.documents,
        host.workspace,
        host.picker,
        host.notifier,
    );
    const writtenPaths: string[] = [];
    host.workspace.createWatcher("/work", "**/*.bpmn", {
        onChange: (path) => writtenPaths.push(path),
    });
    return { service, writtenPaths, ...host };
}

const promptedMethods = (picker: { prompts: { method: string }[] }) =>
    picker.prompts.map((prompt) => prompt.method);

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("migrateAllDiagrams", () => {
    it("should show info and return false when no BPMN files are found", async () => {
        const { service, notifier } = createHost({});

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(false);
        expect(notifier.infos).toEqual(["No BPMN files found in the workspace."]);
    });

    it("should show info and return false when no engine is detectable", async () => {
        const { service, notifier } = createHost({ "/work/a.bpmn": unknownBpmn });

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(false);
        expect(notifier.infos).toEqual([
            "Could not detect the engine for any BPMN file in the workspace.",
        ]);
    });

    it("should migrate C8-only workspace without scope picker", async () => {
        const { service, notifier, picker, workspace, writtenPaths } = createHost(
            { "/work/a.bpmn": c8Bpmn("8.5.0"), "/work/b.bpmn": c8Bpmn("8.6.0") },
            { engineVersion: "8.8.0" },
        );

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(true);
        expect(promptedMethods(picker)).toEqual(["pickEngineVersion"]);
        expect(picker.prompts[0].args[0]).toBe("c8");
        expect(writtenPaths).toEqual(["/work/a.bpmn", "/work/b.bpmn"]);
        expect(workspace.files.get("/work/a.bpmn")).toContain(
            'modeler:executionPlatformVersion="8.8.0"',
        );
        expect(workspace.files.get("/work/b.bpmn")).toContain(
            'modeler:executionPlatformVersion="8.8.0"',
        );
        expect(notifier.infos).toEqual(["Updated 2 diagram(s) to Camunda 8 (8.8.0)."]);
    });

    it("should migrate C7-only workspace without scope picker", async () => {
        const { service, picker, workspace, writtenPaths } = createHost(
            { "/work/c7.bpmn": c7Bpmn("7.20.0") },
            { engineVersion: "7.24.0" },
        );

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(true);
        expect(promptedMethods(picker)).toEqual(["pickEngineVersion"]);
        expect(picker.prompts[0].args[0]).toBe("c7");
        expect(writtenPaths).toEqual(["/work/c7.bpmn"]);
        expect(workspace.files.get("/work/c7.bpmn")).toContain(
            'modeler:executionPlatformVersion="7.24.0"',
        );
    });

    it("should show scope picker when both platforms are present", async () => {
        const { service, picker, writtenPaths } = createHost(
            { "/work/c7.bpmn": c7Bpmn("7.20.0"), "/work/c8.bpmn": c8Bpmn("8.5.0") },
            { migrationScope: "c8", engineVersion: "8.8.0" },
        );

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(true);
        /**
         * Only C8 was selected, so only one version picker
         */
        expect(picker.prompts).toEqual([
            { method: "pickMigrationScope", args: [1, 1] },
            { method: "pickEngineVersion", args: ["c8", expect.any(Object)] },
        ]);
        expect(writtenPaths).toEqual(["/work/c8.bpmn"]);
    });

    it("should pick two versions when scope is 'both'", async () => {
        const { service, picker, writtenPaths } = createHost(
            { "/work/c7.bpmn": c7Bpmn("7.20.0"), "/work/c8.bpmn": c8Bpmn("8.5.0") },
            { migrationScope: "both" },
        );
        const writesSeenAtVersionPick: number[] = [];
        vi.spyOn(picker, "pickEngineVersion").mockImplementation(async (platform) => {
            writesSeenAtVersionPick.push(writtenPaths.length);
            return platform === "c7" ? "7.24.0" : "8.8.0";
        });

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(true);
        expect(writtenPaths).toEqual(["/work/c7.bpmn", "/work/c8.bpmn"]);

        // Both version picks must complete before any write occurs.
        // This prevents document-change listeners from dismissing the QuickPick.
        expect(writesSeenAtVersionPick).toEqual([0, 0]);
    });

    it("should skip files already at the target version", async () => {
        const { service, notifier, writtenPaths } = createHost(
            {
                "/work/a.bpmn": c8Bpmn("8.8.0"), // already at target
                "/work/b.bpmn": c8Bpmn("8.5.0"), // needs update
            },
            { engineVersion: "8.8.0" },
        );

        await service.migrateAllDiagrams();

        expect(writtenPaths).toEqual(["/work/b.bpmn"]);
        expect(notifier.infos).toEqual(["Updated 1 diagram(s) to Camunda 8 (8.8.0)."]);
    });

    it("should show 'already at version' when all files match target", async () => {
        const { service, notifier, writtenPaths } = createHost(
            { "/work/a.bpmn": c8Bpmn("8.8.0") },
            { engineVersion: "8.8.0" },
        );

        await service.migrateAllDiagrams();

        expect(writtenPaths).toEqual([]);
        expect(notifier.infos).toEqual(["All diagrams are already at the selected version."]);
    });

    it("should use DocumentPort.write for files open in an editor", async () => {
        const { service, openEditor, workspace, writtenPaths } = createHost(
            { "/work/open.bpmn": c8Bpmn("8.5.0") },
            { engineVersion: "8.8.0" },
        );
        const editor = openEditor("/work/open.bpmn", c8Bpmn("8.5.0"));

        await service.migrateAllDiagrams();

        expect(editor.content).toContain('modeler:executionPlatformVersion="8.8.0"');
        expect(writtenPaths).toEqual([]);
        expect(workspace.files.get("/work/open.bpmn")).toBe(c8Bpmn("8.5.0"));
    });

    it("should use withExecutionPlatform for files without version attribute", async () => {
        const { service, notifier, workspace, writtenPaths } = createHost(
            { "/work/noversion.bpmn": c8BpmnNoVersion },
            { engineVersion: "8.8.0" },
        );

        await service.migrateAllDiagrams();

        expect(writtenPaths).toEqual(["/work/noversion.bpmn"]);
        const writtenContent = workspace.files.get("/work/noversion.bpmn");
        expect(writtenContent).toContain('modeler:executionPlatformVersion="8.8.0"');
        expect(writtenContent).toContain('modeler:executionPlatform="Camunda Cloud"');
        expect(notifier.logged("warning")).toEqual([
            "Added missing executionPlatform attribute to: /work/noversion.bpmn",
        ]);
    });

    it("should return false when user cancels", async () => {
        const { service, writtenPaths } = createHost({ "/work/a.bpmn": c8Bpmn("8.5.0") });

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(false);
        expect(writtenPaths).toEqual([]);
    });

    it("should log undetected files as warnings", async () => {
        const { service, notifier } = createHost(
            { "/work/ok.bpmn": c8Bpmn("8.5.0"), "/work/unknown.bpmn": unknownBpmn },
            { engineVersion: "8.8.0" },
        );

        await service.migrateAllDiagrams();

        expect(notifier.logged("warning")).toEqual([
            "Skipped 1 file(s) with undetectable engine: /work/unknown.bpmn",
        ]);
    });
});
