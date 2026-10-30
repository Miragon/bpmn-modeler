import { describe, expect, it, vi } from "vitest";

import { engineVersionPrompt } from "../../kernel/domain/engineVersions";
import { ChoicePrompt } from "../../kernel/domain/prompts";
import { createTestHost, PromptAnswers, ScriptedPicker } from "../../testing";
import { migrationScopePrompt } from "../domain/migrationScopePrompt";
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

const c8WithoutDefinitionsRoot = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:process xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="Process_1" />`;

const withUnsavedEdit = (xml: string) =>
    xml.replace("</bpmn:definitions>", `<bpmn:process id="Unsaved_Edit" />\n</bpmn:definitions>`);

// ─── Host ───────────────────────────────────────────────────────────────────

function createHost(files: Record<string, string>, promptAnswers: PromptAnswers = {}) {
    const host = createTestHost({ folders: ["/work"], files, promptAnswers });
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

/** Runs `duringChoice` while the user still chooses, then answers as scripted. */
function whileChoosing(picker: ScriptedPicker, duringChoice: () => unknown) {
    const choose = picker.choose.bind(picker);
    vi.spyOn(picker, "choose").mockImplementation(async <V>(prompt: ChoicePrompt<V>) => {
        await duringChoice();
        return choose(prompt);
    });
}

const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

const failingOn =
    <Rest extends unknown[], Result>(
        failingPath: string,
        operation: (path: string, ...rest: Rest) => Promise<Result>,
    ) =>
    async (path: string, ...rest: Rest): Promise<Result> => {
        if (path === failingPath) {
            throw new Error("Permission denied");
        }
        return operation(path, ...rest);
    };

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
        expect(notifier.logged("warning")).toEqual([
            "Skipped 1 file(s) with undetectable engine: /work/a.bpmn",
        ]);
    });

    it("should migrate C8-only workspace without scope picker", async () => {
        const { service, notifier, picker, workspace, writtenPaths } = createHost(
            { "/work/a.bpmn": c8Bpmn("8.5.0"), "/work/b.bpmn": c8Bpmn("8.6.0") },
            { c8EngineVersion: "8.8.0" },
        );

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(true);
        expect(picker.prompts).toEqual([{ method: "choose", args: [engineVersionPrompt("c8")] }]);
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
            { c7EngineVersion: "7.24.0" },
        );

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(true);
        expect(picker.prompts).toEqual([{ method: "choose", args: [engineVersionPrompt("c7")] }]);
        expect(writtenPaths).toEqual(["/work/c7.bpmn"]);
        expect(workspace.files.get("/work/c7.bpmn")).toContain(
            'modeler:executionPlatformVersion="7.24.0"',
        );
    });

    it("should show scope picker when both platforms are present", async () => {
        const { service, picker, writtenPaths } = createHost(
            {
                "/work/c7.bpmn": c7Bpmn("7.20.0"),
                "/work/c7-other.bpmn": c7Bpmn("7.20.0"),
                "/work/c8.bpmn": c8Bpmn("8.5.0"),
            },
            { migrationScope: "c8", c8EngineVersion: "8.8.0" },
        );

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(true);
        /**
         * Only C8 was selected, so only one version picker
         */
        expect(picker.prompts).toEqual([
            { method: "choose", args: [migrationScopePrompt({ c7Count: 2, c8Count: 1 })] },
            { method: "choose", args: [engineVersionPrompt("c8")] },
        ]);
        expect(writtenPaths).toEqual(["/work/c8.bpmn"]);
    });

    it("should pick two versions when scope is 'both'", async () => {
        const { service, picker, writtenPaths } = createHost(
            { "/work/c7.bpmn": c7Bpmn("7.20.0"), "/work/c8.bpmn": c8Bpmn("8.5.0") },
            { migrationScope: "both", c7EngineVersion: "7.24.0", c8EngineVersion: "8.8.0" },
        );
        const writesSeenAtEachChoice: number[] = [];
        whileChoosing(picker, () => writesSeenAtEachChoice.push(writtenPaths.length));

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(true);
        expect(writtenPaths).toEqual(["/work/c7.bpmn", "/work/c8.bpmn"]);

        expect(picker.prompts).toEqual([
            { method: "choose", args: [migrationScopePrompt({ c7Count: 1, c8Count: 1 })] },
            { method: "choose", args: [engineVersionPrompt("c7")] },
            { method: "choose", args: [engineVersionPrompt("c8")] },
        ]);
        // Every choice must complete before any write occurs.
        // This prevents document-change listeners from dismissing the QuickPick.
        expect(writesSeenAtEachChoice).toEqual([0, 0, 0]);
    });

    it("neither writes nor counts a diagram already at the picked version", async () => {
        const { service, notifier, writtenPaths } = createHost(
            {
                "/work/a.bpmn": c8Bpmn("8.8.0"),
                "/work/b.bpmn": c8Bpmn("8.5.0"),
            },
            { c8EngineVersion: "8.8.0" },
        );

        await service.migrateAllDiagrams();

        expect(writtenPaths).toEqual(["/work/b.bpmn"]);
        expect(notifier.infos).toEqual(["Updated 1 diagram(s) to Camunda 8 (8.8.0)."]);
    });

    it("should use DocumentPort.write for files open in an editor", async () => {
        const { service, openEditor, workspace, writtenPaths } = createHost(
            { "/work/open.bpmn": c8Bpmn("8.5.0") },
            { c8EngineVersion: "8.8.0" },
        );
        const editor = openEditor("/work/open.bpmn", c8Bpmn("8.5.0"));

        await service.migrateAllDiagrams();

        expect(editor.content).toContain('modeler:executionPlatformVersion="8.8.0"');
        expect(writtenPaths).toEqual([]);
        expect(workspace.files.get("/work/open.bpmn")).toBe(c8Bpmn("8.5.0"));
    });

    it("keeps unsaved edits of an open diagram when migrating it", async () => {
        const { service, openEditor, workspace, writtenPaths } = createHost(
            { "/work/open.bpmn": c8Bpmn("8.5.0") },
            { c8EngineVersion: "8.8.0" },
        );
        const editor = openEditor("/work/open.bpmn", withUnsavedEdit(c8Bpmn("8.5.0")));

        await service.migrateAllDiagrams();

        expect(editor.content).toContain('id="Unsaved_Edit"');
        expect(editor.content).toContain('modeler:executionPlatformVersion="8.8.0"');
        expect(workspace.files.get("/work/open.bpmn")).toBe(c8Bpmn("8.5.0"));
        expect(writtenPaths).toEqual([]);
    });

    it("decides from the open editor's content, not from disk, whether a diagram needs migrating", async () => {
        const { service, notifier, openEditor } = createHost(
            { "/work/open.bpmn": c8Bpmn("8.8.0") },
            { c8EngineVersion: "8.8.0" },
        );
        const editor = openEditor("/work/open.bpmn", c8Bpmn("8.5.0"));

        await service.migrateAllDiagrams();

        expect(editor.content).toBe(c8Bpmn("8.8.0"));
        expect(notifier.infos).toEqual(["Updated 1 diagram(s) to Camunda 8 (8.8.0)."]);
    });

    it("plans an open diagram by its editor's engine while its file on disk is still empty", async () => {
        const { service, notifier, openEditor, picker } = createHost(
            { "/work/new.bpmn": "" },
            { c8EngineVersion: "8.8.0" },
        );
        const editor = openEditor("/work/new.bpmn", c8Bpmn("8.5.0"));

        await service.migrateAllDiagrams();

        expect(picker.prompts).toEqual([{ method: "choose", args: [engineVersionPrompt("c8")] }]);
        expect(editor.content).toBe(c8Bpmn("8.8.0"));
        expect(notifier.infos).toEqual(["Updated 1 diagram(s) to Camunda 8 (8.8.0)."]);
    });

    it("migrates an open diagram from the content it has when written, not when planned", async () => {
        const { service, documents, openEditor, picker } = createHost(
            { "/work/open.bpmn": c8Bpmn("8.5.0") },
            { c8EngineVersion: "8.8.0" },
        );
        const editor = openEditor("/work/open.bpmn", c8Bpmn("8.5.0"));
        whileChoosing(picker, () => documents.write(editor.id, withUnsavedEdit(c8Bpmn("8.5.0"))));

        await service.migrateAllDiagrams();

        expect(editor.content).toBe(withUnsavedEdit(c8Bpmn("8.8.0")));
    });

    it("migrates a closed diagram from the content it has on disk when written, not when planned", async () => {
        const { service, picker, workspace } = createHost(
            { "/work/a.bpmn": c8Bpmn("8.5.0") },
            { c8EngineVersion: "8.8.0" },
        );
        whileChoosing(picker, () =>
            workspace.files.set("/work/a.bpmn", withUnsavedEdit(c8Bpmn("8.5.0"))),
        );

        await service.migrateAllDiagrams();

        expect(workspace.files.get("/work/a.bpmn")).toBe(withUnsavedEdit(c8Bpmn("8.8.0")));
    });

    it("reports an open diagram whose editor rejected the write as skipped, not updated", async () => {
        const { service, documents, notifier, openEditor } = createHost(
            { "/work/open.bpmn": c8Bpmn("8.5.0") },
            { c8EngineVersion: "8.8.0" },
        );
        openEditor("/work/open.bpmn", c8Bpmn("8.5.0"));
        vi.spyOn(documents, "write").mockResolvedValue(false);

        await service.migrateAllDiagrams();

        expect(notifier.infos).toEqual([
            "No diagrams were updated. Skipped 1 diagram(s); see the log for details.",
        ]);
        expect(notifier.logged("warning")).toEqual([expect.stringContaining("/work/open.bpmn")]);
    });

    it("reports the skipped diagrams next to the updated ones", async () => {
        const { service, documents, notifier, openEditor } = createHost(
            { "/work/c7.bpmn": c7Bpmn("7.20.0"), "/work/c8.bpmn": c8Bpmn("8.5.0") },
            { migrationScope: "both", c7EngineVersion: "7.24.0", c8EngineVersion: "8.8.0" },
        );
        openEditor("/work/c7.bpmn", c7Bpmn("7.20.0"));
        vi.spyOn(documents, "write").mockResolvedValue(false);

        await service.migrateAllDiagrams();

        expect(notifier.infos).toEqual([
            "Updated 1 diagram(s) to Camunda 8 (8.8.0). Skipped 1 diagram(s); see the log for details.",
        ]);
    });

    it("does not report an added executionPlatform that the editor rejected", async () => {
        const { service, documents, notifier, openEditor } = createHost(
            { "/work/noversion.bpmn": c8BpmnNoVersion },
            { c8EngineVersion: "8.8.0" },
        );
        openEditor("/work/noversion.bpmn", c8BpmnNoVersion);
        vi.spyOn(documents, "write").mockResolvedValue(false);

        await service.migrateAllDiagrams();

        expect(notifier.logged("warning")).toEqual([
            "Skipped a diagram whose editor rejected the update: /work/noversion.bpmn",
        ]);
    });

    it("skips an open diagram whose engine changed while the version was being picked", async () => {
        const { service, documents, notifier, openEditor, picker } = createHost(
            { "/work/open.bpmn": c8Bpmn("8.5.0") },
            { c8EngineVersion: "8.8.0" },
        );
        const editor = openEditor("/work/open.bpmn", c8Bpmn("8.5.0"));
        whileChoosing(picker, () => documents.write(editor.id, c7Bpmn("7.20.0")));

        await service.migrateAllDiagrams();

        expect(editor.content).toBe(c7Bpmn("7.20.0"));
        expect(notifier.logged("warning")).toEqual([
            "Skipped a diagram whose engine changed during migration: /work/open.bpmn",
        ]);
        expect(notifier.infos).toEqual([
            "No diagrams were updated. Skipped 1 diagram(s); see the log for details.",
        ]);
    });

    it("skips a closed diagram deleted while the version was being picked and migrates the rest", async () => {
        const { service, notifier, picker, workspace } = createHost(
            { "/work/a.bpmn": c8Bpmn("8.5.0"), "/work/b.bpmn": c8Bpmn("8.5.0") },
            { c8EngineVersion: "8.8.0" },
        );
        whileChoosing(picker, () => workspace.deleteFile("/work/a.bpmn"));

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(true);
        expect(workspace.files.has("/work/a.bpmn")).toBe(false);
        expect(workspace.files.get("/work/b.bpmn")).toBe(c8Bpmn("8.8.0"));
        expect(notifier.errors).toEqual([]);
        expect(notifier.logged("warning")).toEqual([
            "Skipped a diagram deleted during migration: /work/a.bpmn",
        ]);
        expect(notifier.infos).toEqual([
            "Updated 1 diagram(s) to Camunda 8 (8.8.0). Skipped 1 diagram(s); see the log for details.",
        ]);
    });

    it("skips a diagram deleted between the workspace search and its read and migrates the rest", async () => {
        const { service, notifier, workspace } = createHost(
            { "/work/a.bpmn": c8Bpmn("8.5.0"), "/work/b.bpmn": c8Bpmn("8.5.0") },
            { c8EngineVersion: "8.8.0" },
        );
        const findFiles = workspace.findFiles.bind(workspace);
        vi.spyOn(workspace, "findFiles").mockImplementation(async (...args) => {
            const found = await findFiles(...args);
            workspace.deleteFile("/work/a.bpmn");
            return found;
        });

        const result = await service.migrateAllDiagrams();

        expect(Object.fromEntries(workspace.files)).toEqual({ "/work/b.bpmn": c8Bpmn("8.8.0") });
        expect(notifier.errors).toEqual([]);
        expect(notifier.logged("warning")).toEqual([
            "Skipped a diagram deleted during migration: /work/a.bpmn",
        ]);
        expect(notifier.infos).toEqual([
            "Updated 1 diagram(s) to Camunda 8 (8.8.0). Skipped 1 diagram(s); see the log for details.",
        ]);
        expect(result).toBe(true);
    });

    it("skips a diagram without a definitions root and migrates the rest", async () => {
        const { service, notifier, workspace } = createHost(
            {
                "/work/a.bpmn": c8Bpmn("8.5.0"),
                "/work/b.bpmn": c8WithoutDefinitionsRoot,
                "/work/c.bpmn": c8Bpmn("8.5.0"),
            },
            { c8EngineVersion: "8.8.0" },
        );

        const result = await service.migrateAllDiagrams();

        expect(Object.fromEntries(workspace.files)).toEqual({
            "/work/a.bpmn": c8Bpmn("8.8.0"),
            "/work/b.bpmn": c8WithoutDefinitionsRoot,
            "/work/c.bpmn": c8Bpmn("8.8.0"),
        });
        expect(notifier.errors).toEqual([]);
        expect(notifier.logged("warning")).toEqual([
            expect.stringMatching(
                /^Skipped a diagram that could not be migrated: \/work\/b\.bpmn: Error: The BPMN file does not contain a `definitions` root element\.\n/,
            ),
        ]);
        expect(notifier.infos).toEqual([
            "Updated 2 diagram(s) to Camunda 8 (8.8.0). Skipped 1 diagram(s); see the log for details.",
        ]);
        expect(result).toBe(true);
    });

    it("skips a diagram it cannot read and migrates the rest", async () => {
        const { service, notifier, picker, workspace } = createHost(
            {
                "/work/a.bpmn": c8Bpmn("8.5.0"),
                "/work/b.bpmn": c8Bpmn("8.5.0"),
                "/work/c.bpmn": c8Bpmn("8.5.0"),
            },
            { c8EngineVersion: "8.8.0" },
        );
        const readFile = workspace.readFile.bind(workspace);
        vi.spyOn(workspace, "readFile").mockImplementation(failingOn("/work/b.bpmn", readFile));

        const result = await service.migrateAllDiagrams();

        expect(picker.prompts).toEqual([{ method: "choose", args: [engineVersionPrompt("c8")] }]);
        expect(Object.fromEntries(workspace.files)).toEqual({
            "/work/a.bpmn": c8Bpmn("8.8.0"),
            "/work/b.bpmn": c8Bpmn("8.5.0"),
            "/work/c.bpmn": c8Bpmn("8.8.0"),
        });
        expect(notifier.errors).toEqual([]);
        expect(notifier.logged("warning")).toEqual([
            expect.stringMatching(
                /^Skipped a diagram that could not be read: \/work\/b\.bpmn: Error: Permission denied\n/,
            ),
        ]);
        expect(notifier.infos).toEqual([
            "Updated 2 diagram(s) to Camunda 8 (8.8.0). Skipped 1 diagram(s); see the log for details.",
        ]);
        expect(result).toBe(true);
    });

    it("reports a diagram it cannot read when no other diagram has an engine to migrate", async () => {
        const { service, notifier, picker, workspace } = createHost({
            "/work/a.bpmn": c8Bpmn("8.5.0"),
            "/work/unknown.bpmn": unknownBpmn,
        });
        const readFile = workspace.readFile.bind(workspace);
        vi.spyOn(workspace, "readFile").mockImplementation(failingOn("/work/a.bpmn", readFile));

        const result = await service.migrateAllDiagrams();

        expect(picker.prompts).toEqual([]);
        expect(notifier.errors).toEqual([]);
        expect(notifier.logged("warning")).toEqual([
            expect.stringMatching(
                /^Skipped a diagram that could not be read: \/work\/a\.bpmn: Error: Permission denied\n/,
            ),
            "Skipped 1 file(s) with undetectable engine: /work/unknown.bpmn",
        ]);
        expect(notifier.infos).toEqual([
            "No diagrams were updated. Skipped 1 diagram(s); see the log for details.",
        ]);
        expect(result).toBe(false);
    });

    it("skips a closed diagram it cannot read when writing it and migrates the rest", async () => {
        const { service, notifier, picker, workspace } = createHost(
            { "/work/a.bpmn": c8Bpmn("8.5.0"), "/work/b.bpmn": c8Bpmn("8.5.0") },
            { c8EngineVersion: "8.8.0" },
        );
        const readFile = workspace.readFile.bind(workspace);
        whileChoosing(picker, () =>
            vi.spyOn(workspace, "readFile").mockImplementation(failingOn("/work/a.bpmn", readFile)),
        );

        const result = await service.migrateAllDiagrams();

        expect(Object.fromEntries(workspace.files)).toEqual({
            "/work/a.bpmn": c8Bpmn("8.5.0"),
            "/work/b.bpmn": c8Bpmn("8.8.0"),
        });
        expect(notifier.errors).toEqual([]);
        expect(notifier.logged("warning")).toEqual([
            expect.stringMatching(
                /^Skipped a diagram that could not be migrated: \/work\/a\.bpmn: Error: Permission denied\n/,
            ),
        ]);
        expect(notifier.infos).toEqual([
            "Updated 1 diagram(s) to Camunda 8 (8.8.0). Skipped 1 diagram(s); see the log for details.",
        ]);
        expect(result).toBe(true);
    });

    it("skips a closed diagram whose file cannot be written and migrates the rest", async () => {
        const { service, notifier, workspace } = createHost(
            { "/work/a.bpmn": c8BpmnNoVersion, "/work/b.bpmn": c8Bpmn("8.5.0") },
            { c8EngineVersion: "8.8.0" },
        );
        const writeFile = workspace.writeFile.bind(workspace);
        vi.spyOn(workspace, "writeFile").mockImplementation(failingOn("/work/a.bpmn", writeFile));

        const result = await service.migrateAllDiagrams();

        expect(Object.fromEntries(workspace.files)).toEqual({
            "/work/a.bpmn": c8BpmnNoVersion,
            "/work/b.bpmn": c8Bpmn("8.8.0"),
        });
        expect(notifier.errors).toEqual([]);
        expect(notifier.logged("warning")).toEqual([
            expect.stringMatching(
                /^Skipped a diagram that could not be migrated: \/work\/a\.bpmn: Error: Permission denied\n/,
            ),
        ]);
        expect(notifier.infos).toEqual([
            "Updated 1 diagram(s) to Camunda 8 (8.8.0). Skipped 1 diagram(s); see the log for details.",
        ]);
        expect(result).toBe(true);
    });

    it("stamps the execution platform on a diagram without a version, declaring each attribute once", async () => {
        const { service, notifier, workspace, writtenPaths } = createHost(
            { "/work/noversion.bpmn": c8BpmnNoVersion },
            { c8EngineVersion: "8.8.0" },
        );

        await service.migrateAllDiagrams();

        expect(writtenPaths).toEqual(["/work/noversion.bpmn"]);
        const writtenContent = workspace.files.get("/work/noversion.bpmn") ?? "";
        expect({
            zeebeNamespace: occurrences(writtenContent, "xmlns:zeebe="),
            modelerNamespace: occurrences(writtenContent, "xmlns:modeler="),
            executionPlatform: occurrences(
                writtenContent,
                'modeler:executionPlatform="Camunda Cloud"',
            ),
            executionPlatformVersion: occurrences(
                writtenContent,
                'modeler:executionPlatformVersion="8.8.0"',
            ),
        }).toEqual({
            zeebeNamespace: 1,
            modelerNamespace: 1,
            executionPlatform: 1,
            executionPlatformVersion: 1,
        });
        expect(notifier.logged("warning")).toEqual([
            "Added missing executionPlatform attribute to: /work/noversion.bpmn",
        ]);
    });

    it("migrates nothing and stays quiet when the user dismisses the version prompt", async () => {
        const { service, notifier, picker, writtenPaths } = createHost({
            "/work/a.bpmn": c8Bpmn("8.5.0"),
        });

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(false);
        expect(picker.prompts).toEqual([{ method: "choose", args: [engineVersionPrompt("c8")] }]);
        expect(writtenPaths).toEqual([]);
        expect(notifier.infos).toEqual([]);
        expect(notifier.errors).toEqual([]);
    });

    it("migrates nothing and stays quiet when the user dismisses the scope prompt", async () => {
        const { service, notifier, picker, writtenPaths } = createHost({
            "/work/c7.bpmn": c7Bpmn("7.20.0"),
            "/work/c8.bpmn": c8Bpmn("8.5.0"),
        });

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(false);
        expect(picker.prompts).toEqual([
            { method: "choose", args: [migrationScopePrompt({ c7Count: 1, c8Count: 1 })] },
        ]);
        expect(writtenPaths).toEqual([]);
        expect(notifier.infos).toEqual([]);
        expect(notifier.errors).toEqual([]);
    });

    it("migrates neither engine when the user dismisses the second version prompt", async () => {
        const { service, notifier, picker, workspace } = createHost(
            { "/work/c7.bpmn": c7Bpmn("7.20.0"), "/work/c8.bpmn": c8Bpmn("8.5.0") },
            { migrationScope: "both", c7EngineVersion: "7.24.0" },
        );

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(false);
        expect(picker.prompts.at(-1)).toEqual({
            method: "choose",
            args: [engineVersionPrompt("c8")],
        });
        expect(Object.fromEntries(workspace.files)).toEqual({
            "/work/c7.bpmn": c7Bpmn("7.20.0"),
            "/work/c8.bpmn": c8Bpmn("8.5.0"),
        });
        expect(notifier.infos).toEqual([]);
        expect(notifier.errors).toEqual([]);
    });

    it("shows an error and migrates nothing when the workspace cannot be searched", async () => {
        const { service, notifier, picker, workspace } = createHost({
            "/work/a.bpmn": c8Bpmn("8.5.0"),
        });
        vi.spyOn(workspace, "findFiles").mockRejectedValue(new Error("Search failed"));

        const result = await service.migrateAllDiagrams();

        expect(picker.prompts).toEqual([]);
        expect(workspace.files.get("/work/a.bpmn")).toBe(c8Bpmn("8.5.0"));
        expect(notifier.errors).toEqual([
            "A problem occurred while migrating BPMN diagrams.\nSearch failed",
        ]);
        expect(notifier.infos).toEqual([]);
        expect(result).toBe(false);
    });

    it("should log undetected files as warnings", async () => {
        const { service, notifier } = createHost(
            { "/work/ok.bpmn": c8Bpmn("8.5.0"), "/work/unknown.bpmn": unknownBpmn },
            { c8EngineVersion: "8.8.0" },
        );

        await service.migrateAllDiagrams();

        expect(notifier.logged("warning")).toEqual([
            "Skipped 1 file(s) with undetectable engine: /work/unknown.bpmn",
        ]);
    });
});
