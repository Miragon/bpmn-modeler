import { describe, expect, it, vi } from "vitest";

import { UserCancelledError } from "../domain/errors";
import { BpmnModelerService } from "./BpmnModelerService";

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

// ─── Mocks ──────────────────────────────────────────────────────────────────

function createMocks() {
    const editorStore = {
        findEditorIdByPath: vi.fn().mockReturnValue(undefined),
        postMessage: vi.fn(),
        getActiveEditorId: vi.fn(),
        getDocumentForEditor: vi.fn(),
        subscribeToMessageEvent: vi.fn(),
        subscribeToActiveEditorMessage: vi.fn(),
    };

    const vsDocument = {
        write: vi.fn().mockResolvedValue(true),
        getContent: vi.fn(),
        getFilePath: vi.fn(),
        save: vi.fn(),
    };

    const vsSettings = {
        getAlignToOrigin: vi.fn(),
        getShowTransactionBoundaries: vi.fn(),
    };

    const vsUI = {
        showInfo: vi.fn(),
        showError: vi.fn(),
        logInfo: vi.fn(),
        logWarning: vi.fn(),
        logError: vi.fn(),
        pickExecutionPlatform: vi.fn(),
        pickEngineVersion: vi.fn(),
        pickMigrationScope: vi.fn(),
        toggleTextEditor: vi.fn(),
        readClipboard: vi.fn(),
        writeClipboard: vi.fn(),
        openLoggingConsole: vi.fn(),
    };

    const artifactSvc = {
        getArtifactPaths: vi.fn(),
        readFile: vi.fn(),
        createWatcher: vi.fn(),
    };

    const statusBar = {
        showEngineVersion: vi.fn(),
        showElementTemplatesLoading: vi.fn(),
        showElementTemplatesReady: vi.fn(),
        hideElementTemplatesStatus: vi.fn(),
    };

    const vsWorkspace = {
        findFiles: vi.fn().mockResolvedValue([]),
        readFile: vi.fn(),
        writeFile: vi.fn().mockResolvedValue(undefined),
        getWorkspaceFolderForDocument: vi.fn(),
        readDirectory: vi.fn(),
        findGitRoot: vi.fn(),
    };

    const panelStateRepo = {
        getVisibility: vi.fn().mockReturnValue(true),
        setVisibility: vi.fn().mockResolvedValue(undefined),
    };

    const service = new BpmnModelerService(
        editorStore as any,
        vsDocument as any,
        vsSettings as any,
        vsUI as any,
        artifactSvc as any,
        statusBar as any,
        vsWorkspace as any,
        panelStateRepo as any,
    );

    return { service, editorStore, vsDocument, vsUI, vsWorkspace };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("migrateAllDiagrams", () => {
    it("should show info and return false when no BPMN files are found", async () => {
        const { service, vsWorkspace, vsUI } = createMocks();
        vsWorkspace.findFiles.mockResolvedValue([]);

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(false);
        expect(vsUI.showInfo).toHaveBeenCalledWith("No BPMN files found in the workspace.");
    });

    it("should show info and return false when no engine is detectable", async () => {
        const { service, vsWorkspace, vsUI } = createMocks();
        vsWorkspace.findFiles.mockResolvedValue(["/a.bpmn"]);
        vsWorkspace.readFile.mockResolvedValue(unknownBpmn);

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(false);
        expect(vsUI.showInfo).toHaveBeenCalledWith(
            "Could not detect the engine for any BPMN file in the workspace.",
        );
    });

    it("should migrate C8-only workspace without scope picker", async () => {
        const { service, vsWorkspace, vsUI } = createMocks();
        vsWorkspace.findFiles.mockResolvedValue(["/a.bpmn", "/b.bpmn"]);
        vsWorkspace.readFile
            .mockResolvedValueOnce(c8Bpmn("8.5.0"))
            .mockResolvedValueOnce(c8Bpmn("8.6.0"));
        vsUI.pickEngineVersion.mockResolvedValue("8.8.0");

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(true);
        expect(vsUI.pickMigrationScope).not.toHaveBeenCalled();
        expect(vsUI.pickEngineVersion).toHaveBeenCalledWith("c8", expect.any(Object));
        expect(vsWorkspace.writeFile).toHaveBeenCalledTimes(2);
        expect(vsUI.showInfo).toHaveBeenCalledWith(
            expect.stringContaining("2 diagram(s) to Camunda 8 (8.8.0)"),
        );
    });

    it("should migrate C7-only workspace without scope picker", async () => {
        const { service, vsWorkspace, vsUI } = createMocks();
        vsWorkspace.findFiles.mockResolvedValue(["/c7.bpmn"]);
        vsWorkspace.readFile.mockResolvedValue(c7Bpmn("7.20.0"));
        vsUI.pickEngineVersion.mockResolvedValue("7.24.0");

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(true);
        expect(vsUI.pickMigrationScope).not.toHaveBeenCalled();
        expect(vsUI.pickEngineVersion).toHaveBeenCalledWith("c7", expect.any(Object));
        expect(vsWorkspace.writeFile).toHaveBeenCalledTimes(1);
    });

    it("should show scope picker when both platforms are present", async () => {
        const { service, vsWorkspace, vsUI } = createMocks();
        vsWorkspace.findFiles.mockResolvedValue(["/c7.bpmn", "/c8.bpmn"]);
        vsWorkspace.readFile
            .mockResolvedValueOnce(c7Bpmn("7.20.0"))
            .mockResolvedValueOnce(c8Bpmn("8.5.0"));
        vsUI.pickMigrationScope.mockResolvedValue("c8");
        vsUI.pickEngineVersion.mockResolvedValue("8.8.0");

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(true);
        expect(vsUI.pickMigrationScope).toHaveBeenCalledWith(1, 1);
        // Only C8 was selected, so only one version picker
        expect(vsUI.pickEngineVersion).toHaveBeenCalledTimes(1);
        expect(vsUI.pickEngineVersion).toHaveBeenCalledWith("c8", expect.any(Object));
    });

    it("should pick two versions when scope is 'both'", async () => {
        const { service, vsWorkspace, vsUI } = createMocks();
        vsWorkspace.findFiles.mockResolvedValue(["/c7.bpmn", "/c8.bpmn"]);
        vsWorkspace.readFile
            .mockResolvedValueOnce(c7Bpmn("7.20.0"))
            .mockResolvedValueOnce(c8Bpmn("8.5.0"));
        vsUI.pickMigrationScope.mockResolvedValue("both");
        vsUI.pickEngineVersion.mockResolvedValueOnce("7.24.0").mockResolvedValueOnce("8.8.0");

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(true);
        expect(vsUI.pickEngineVersion).toHaveBeenCalledTimes(2);
        expect(vsWorkspace.writeFile).toHaveBeenCalledTimes(2);

        // Both version picks must complete before any write occurs.
        // This prevents document-change listeners from dismissing the QuickPick.
        const pickOrder = vsUI.pickEngineVersion.mock.invocationCallOrder;
        const writeOrder = vsWorkspace.writeFile.mock.invocationCallOrder;
        const lastPick = Math.max(...pickOrder);
        const firstWrite = Math.min(...writeOrder);
        expect(lastPick).toBeLessThan(firstWrite);
    });

    it("should skip files already at the target version", async () => {
        const { service, vsWorkspace, vsUI } = createMocks();
        vsWorkspace.findFiles.mockResolvedValue(["/a.bpmn", "/b.bpmn"]);
        vsWorkspace.readFile
            .mockResolvedValueOnce(c8Bpmn("8.8.0")) // already at target
            .mockResolvedValueOnce(c8Bpmn("8.5.0")); // needs update
        vsUI.pickEngineVersion.mockResolvedValue("8.8.0");

        await service.migrateAllDiagrams();

        expect(vsWorkspace.writeFile).toHaveBeenCalledTimes(1);
        expect(vsUI.showInfo).toHaveBeenCalledWith(expect.stringContaining("1 diagram(s)"));
    });

    it("should show 'already at version' when all files match target", async () => {
        const { service, vsWorkspace, vsUI } = createMocks();
        vsWorkspace.findFiles.mockResolvedValue(["/a.bpmn"]);
        vsWorkspace.readFile.mockResolvedValue(c8Bpmn("8.8.0"));
        vsUI.pickEngineVersion.mockResolvedValue("8.8.0");

        await service.migrateAllDiagrams();

        expect(vsWorkspace.writeFile).not.toHaveBeenCalled();
        expect(vsUI.showInfo).toHaveBeenCalledWith(
            "All diagrams are already at the selected version.",
        );
    });

    it("should use VsCodeDocument.write for files open in an editor", async () => {
        const { service, vsWorkspace, vsUI, vsDocument, editorStore } = createMocks();
        vsWorkspace.findFiles.mockResolvedValue(["/open.bpmn"]);
        vsWorkspace.readFile.mockResolvedValue(c8Bpmn("8.5.0"));
        editorStore.findEditorIdByPath.mockReturnValue("editor-1");
        vsUI.pickEngineVersion.mockResolvedValue("8.8.0");

        await service.migrateAllDiagrams();

        expect(vsDocument.write).toHaveBeenCalledWith("editor-1", expect.stringContaining("8.8.0"));
        expect(vsWorkspace.writeFile).not.toHaveBeenCalled();
    });

    it("should use addExecutionPlatform for files without version attribute", async () => {
        const { service, vsWorkspace, vsUI } = createMocks();
        vsWorkspace.findFiles.mockResolvedValue(["/noversion.bpmn"]);
        vsWorkspace.readFile.mockResolvedValue(c8BpmnNoVersion);
        vsUI.pickEngineVersion.mockResolvedValue("8.8.0");

        await service.migrateAllDiagrams();

        expect(vsWorkspace.writeFile).toHaveBeenCalledTimes(1);
        const writtenContent = vsWorkspace.writeFile.mock.calls[0][1] as string;
        expect(writtenContent).toContain('modeler:executionPlatformVersion="8.8.0"');
        expect(writtenContent).toContain('modeler:executionPlatform="Camunda Cloud"');
        expect(vsUI.logWarning).toHaveBeenCalledWith(
            expect.stringContaining("Added missing executionPlatform attribute"),
        );
    });

    it("should return false when user cancels", async () => {
        const { service, vsWorkspace, vsUI } = createMocks();
        vsWorkspace.findFiles.mockResolvedValue(["/a.bpmn"]);
        vsWorkspace.readFile.mockResolvedValue(c8Bpmn("8.5.0"));
        vsUI.pickEngineVersion.mockRejectedValue(new UserCancelledError());

        const result = await service.migrateAllDiagrams();

        expect(result).toBe(false);
    });

    it("should log undetected files as warnings", async () => {
        const { service, vsWorkspace, vsUI } = createMocks();
        vsWorkspace.findFiles.mockResolvedValue(["/ok.bpmn", "/unknown.bpmn"]);
        vsWorkspace.readFile
            .mockResolvedValueOnce(c8Bpmn("8.5.0"))
            .mockResolvedValueOnce(unknownBpmn);
        vsUI.pickEngineVersion.mockResolvedValue("8.8.0");

        await service.migrateAllDiagrams();

        expect(vsUI.logWarning).toHaveBeenCalledWith(expect.stringContaining("Skipped 1 file(s)"));
    });
});
