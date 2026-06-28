import { posix } from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileNotFound } from "../../shared/domain/errors";
import { WorkspacePort } from "../../shared/domain/hostPorts";
import { ScriptVariableManifestService } from "./ScriptVariableManifestService";

const DOCUMENT = "/work/diagram.bpmn";
const MANIFEST_PATH = "/work/diagram.bpmn.vars.json";

interface WatcherHandlers {
    onChange?: (path: string) => void;
    onCreate?: (path: string) => void;
    onDelete?: (path: string) => void;
}

/**
 * Minimal in-memory {@link WorkspacePort} exercising only the three methods the
 * service touches (getDocumentDirectory / readFile / createWatcher); the rest
 * throw so an accidental new dependency surfaces loudly.
 */
class FakeWorkspace implements Partial<WorkspacePort> {
    files = new Map<string, string>();
    lastWatch?: { rootPath: string; glob: string; handlers: WatcherHandlers };
    dispose = vi.fn();

    getDocumentDirectory(document: string): string {
        return posix.dirname(document);
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

function service(ws: FakeWorkspace): ScriptVariableManifestService {
    return new ScriptVariableManifestService(ws as unknown as WorkspacePort);
}

describe("ScriptVariableManifestService", () => {
    let ws: FakeWorkspace;

    beforeEach(() => {
        ws = new FakeWorkspace();
    });

    it("loads the sibling manifest as authored variables", async () => {
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

    it("watches the document directory for the manifest filename", () => {
        const onChange = vi.fn();
        service(ws).createWatcher(DOCUMENT, onChange);

        expect(ws.lastWatch?.rootPath).toBe("/work");
        expect(ws.lastWatch?.glob).toBe("diagram.bpmn.vars.json");

        ws.lastWatch?.handlers.onCreate?.(MANIFEST_PATH);
        ws.lastWatch?.handlers.onChange?.(MANIFEST_PATH);
        ws.lastWatch?.handlers.onDelete?.(MANIFEST_PATH);
        expect(onChange).toHaveBeenCalledTimes(3);
    });

    it("disposes the underlying watcher handle", () => {
        const handle = service(ws).createWatcher(DOCUMENT, vi.fn());
        handle.dispose();
        expect(ws.dispose).toHaveBeenCalledOnce();
    });

    // On Windows the host fs path uses backslashes; getDocumentDirectory already
    // normalizes to posix, so the manifest basename must not be derived from a raw
    // posix.basename of the backslash path (which would return the whole string).
    describe("with a Windows-style backslash document path", () => {
        const WINDOWS_DOCUMENT = "C:\\work\\diagram.bpmn";
        const WINDOWS_MANIFEST_PATH = "C:/work/diagram.bpmn.vars.json";

        beforeEach(() => {
            // getDocumentDirectory is robust (normalizes to posix) — only the
            // basename split regressed, so model the realistic posix directory.
            ws.getDocumentDirectory = () => "C:/work";
        });

        it("computes the manifest filename from the normalized path", async () => {
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

        it("scopes the watcher glob to the bare manifest filename", () => {
            service(ws).createWatcher(WINDOWS_DOCUMENT, vi.fn());

            expect(ws.lastWatch?.rootPath).toBe("C:/work");
            expect(ws.lastWatch?.glob).toBe("diagram.bpmn.vars.json");
        });
    });
});
