import { posix } from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileNotFound } from "../../shared/domain/errors";
import { SettingsPort, WorkspacePort } from "../../shared/domain/hostPorts";
import { ArtifactService } from "../../shared/service/ArtifactService";
import { ScriptVariableManifestService } from "./ScriptVariableManifestService";

const DOCUMENT = "/work/diagram.bpmn";
const MANIFEST_PATH = "/work/.camunda/vars/diagram.bpmn.vars.json";

interface WatcherHandlers {
    onChange?: (path: string) => void;
    onCreate?: (path: string) => void;
    onDelete?: (path: string) => void;
}

/**
 * Minimal in-memory {@link WorkspacePort} exercising only the methods the
 * service and a real {@link ArtifactService} touch (getDocumentDirectory /
 * getWorkspaceFolderForDocument / readFile / createWatcher); the rest throw so
 * an accidental new dependency surfaces loudly.
 */
class FakeWorkspace implements Partial<WorkspacePort> {
    files = new Map<string, string>();
    lastWatch?: { rootPath: string; glob: string; handlers: WatcherHandlers };
    dispose = vi.fn();

    getDocumentDirectory(document: string): string {
        return posix.dirname(document);
    }

    // In these tests the document directory *is* the workspace root, so the real
    // ArtifactService resolves the root by echoing back what it is handed.
    getWorkspaceFolderForDocument(document: string): string {
        return document;
    }

    async readFile(path: string): Promise<string> {
        const content = this.files.get(path);
        if (content === undefined) {
            throw new FileNotFound(path);
        }
        return content;
    }

    createWatcher(rootPath: string, glob: string, handlers: WatcherHandlers): { dispose(): void } {
        this.lastWatch = { rootPath, glob, handlers };
        return { dispose: this.dispose };
    }
}

const FAKE_SETTINGS = { getConfigFolder: () => ".camunda" } as unknown as SettingsPort;

function service(ws: FakeWorkspace): ScriptVariableManifestService {
    const artifactSvc = new ArtifactService(ws as unknown as WorkspacePort, FAKE_SETTINGS);
    return new ScriptVariableManifestService(
        ws as unknown as WorkspacePort,
        FAKE_SETTINGS,
        artifactSvc,
    );
}

describe("ScriptVariableManifestService", () => {
    let ws: FakeWorkspace;

    beforeEach(() => {
        ws = new FakeWorkspace();
    });

    it("loads the manifest under <configFolder>/vars/ as authored variables", async () => {
        ws.files.set(
            MANIFEST_PATH,
            JSON.stringify({ variables: [{ name: "orderId", type: "String" }] }),
        );

        const vars = await service(ws).load(DOCUMENT);

        expect(vars).toEqual([
            {
                name: "orderId",
                origin: "declared in diagram.bpmn.vars.json",
                typeHint: "String",
                description: undefined,
                confidence: "authored",
            },
        ]);
    });

    it("returns [] when the manifest is absent", async () => {
        expect(await service(ws).load(DOCUMENT)).toEqual([]);
    });

    it("returns [] for a malformed manifest rather than throwing", async () => {
        ws.files.set(MANIFEST_PATH, "{ not json");
        expect(await service(ws).load(DOCUMENT)).toEqual([]);
    });

    it("watches the config folder for the manifest path", async () => {
        const onChange = vi.fn();
        await service(ws).createWatcher(DOCUMENT, onChange);

        expect(ws.lastWatch?.rootPath).toBe("/work");
        // `**/` prefix is required for the chokidar adapter to match the absolute
        // manifest path; VS Code matches root-relative either way.
        expect(ws.lastWatch?.glob).toBe("**/.camunda/vars/diagram.bpmn.vars.json");

        ws.lastWatch?.handlers.onCreate?.(MANIFEST_PATH);
        ws.lastWatch?.handlers.onChange?.(MANIFEST_PATH);
        ws.lastWatch?.handlers.onDelete?.(MANIFEST_PATH);
        expect(onChange).toHaveBeenCalledTimes(3);
    });

    it("disposes the underlying watcher handle", async () => {
        const handle = await service(ws).createWatcher(DOCUMENT, vi.fn());
        handle.dispose();
        expect(ws.dispose).toHaveBeenCalledOnce();
    });

    // On Windows the host fs path uses backslashes; getDocumentDirectory already
    // normalizes to posix, so the workspace-relative path must be derived from
    // that normalized directory, not a raw posix split of the backslash path
    // (which would return the whole string and yield a garbage relative path).
    describe("with a Windows-style backslash document path", () => {
        const WINDOWS_DOCUMENT = "C:\\work\\diagram.bpmn";
        const WINDOWS_MANIFEST_PATH = "C:/work/.camunda/vars/diagram.bpmn.vars.json";

        beforeEach(() => {
            // getDocumentDirectory is robust (normalizes to posix) — only the
            // basename split regressed, so model the realistic posix directory.
            ws.getDocumentDirectory = () => "C:/work";
        });

        it("computes the manifest path from the normalized relative path", async () => {
            ws.files.set(
                WINDOWS_MANIFEST_PATH,
                JSON.stringify({ variables: [{ name: "orderId", type: "String" }] }),
            );

            const vars = await service(ws).load(WINDOWS_DOCUMENT);

            expect(vars).toEqual([
                {
                    name: "orderId",
                    origin: "declared in diagram.bpmn.vars.json",
                    typeHint: "String",
                    description: undefined,
                    confidence: "authored",
                },
            ]);
        });

        it("scopes the watcher glob to the relative manifest path, not garbage", async () => {
            await service(ws).createWatcher(WINDOWS_DOCUMENT, vi.fn());

            expect(ws.lastWatch?.rootPath).toBe("C:/work");
            // Relative path is clean (`diagram.bpmn.vars.json`), proving the path
            // is computed in posix space rather than from the backslash raw path.
            expect(ws.lastWatch?.glob).toBe("**/.camunda/vars/diagram.bpmn.vars.json");
        });
    });
});
