import { beforeEach, describe, expect, it, vi } from "vitest";

import { ArtifactService } from "../../shared/service/ArtifactService";
import { createTestHost, InMemorySettings, InMemoryWorkspace } from "../../testing";
import { ScriptVariableManifestService } from "./ScriptVariableManifestService";

const DOCUMENT = "/work/diagram.bpmn";
const MANIFEST_PATH = "/work/.camunda/vars/diagram.bpmn.vars.json";

describe("ScriptVariableManifestService", () => {
    let ws: InMemoryWorkspace;
    let settings: InMemorySettings;

    beforeEach(() => {
        ({ workspace: ws, settings } = createTestHost({ folders: ["/work"] }));
    });

    function service(): ScriptVariableManifestService {
        const artifactSvc = new ArtifactService(ws, settings);
        return new ScriptVariableManifestService(ws, settings, artifactSvc);
    }

    it("loads the manifest under <configFolder>/vars/ as authored variables", async () => {
        ws.files.set(
            MANIFEST_PATH,
            JSON.stringify({ variables: [{ name: "orderId", type: "String" }] }),
        );

        const vars = await service().load(DOCUMENT);

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
        expect(await service().load(DOCUMENT)).toEqual([]);
    });

    it("returns [] for a malformed manifest rather than throwing", async () => {
        ws.files.set(MANIFEST_PATH, "{ not json");
        expect(await service().load(DOCUMENT)).toEqual([]);
    });

    it("resolves the manifest path under <configFolder>/vars/ mirroring the diagram path", async () => {
        expect(await service().resolveManifestPath(DOCUMENT)).toBe(MANIFEST_PATH);
    });

    describe("loadWithStatus", () => {
        it("reports found: true with the variables when the manifest is present", async () => {
            ws.files.set(
                MANIFEST_PATH,
                JSON.stringify({ variables: [{ name: "orderId", type: "String" }] }),
            );

            const result = await service().loadWithStatus(DOCUMENT);

            expect(result).toEqual({
                manifestPath: MANIFEST_PATH,
                found: true,
                variables: [
                    {
                        name: "orderId",
                        origin: "declared in diagram.bpmn.vars.json",
                        typeHint: "String",
                        description: undefined,
                        confidence: "authored",
                    },
                ],
            });
        });

        it("reports found: false with [] when the manifest is absent", async () => {
            expect(await service().loadWithStatus(DOCUMENT)).toEqual({
                manifestPath: MANIFEST_PATH,
                found: false,
                variables: [],
            });
        });

        it("reports found: true with [] for a malformed manifest (present but unparseable)", async () => {
            ws.files.set(MANIFEST_PATH, "{ not json");

            expect(await service().loadWithStatus(DOCUMENT)).toEqual({
                manifestPath: MANIFEST_PATH,
                found: true,
                variables: [],
            });
        });
    });

    it("propagates a non-FileNotFound read error from load and loadWithStatus", async () => {
        // Pins the contract this fix hangs on: only FileNotFound means "no
        // manifest"; a real read failure must reach the host to be surfaced.
        vi.spyOn(ws, "readFile").mockRejectedValue(new Error("EACCES"));

        await expect(service().load(DOCUMENT)).rejects.toThrow(/EACCES/);
        await expect(service().loadWithStatus(DOCUMENT)).rejects.toThrow(/EACCES/);
    });

    it("watches the config folder for the manifest path", async () => {
        const createWatcher = vi.spyOn(ws, "createWatcher");
        const onChange = vi.fn();
        await service().createWatcher(DOCUMENT, onChange);

        const [rootPath, glob] = createWatcher.mock.calls[0];
        expect(rootPath).toBe("/work");
        // `**/` prefix is required for the chokidar adapter to match the absolute
        // manifest path; VS Code matches root-relative either way.
        expect(glob).toBe("**/.camunda/vars/diagram.bpmn.vars.json");

        await ws.writeFile(MANIFEST_PATH, "{}");
        await ws.writeFile(MANIFEST_PATH, '{ "variables": [] }');
        ws.deleteFile(MANIFEST_PATH);
        await ws.writeFile("/work/.camunda/vars/other.bpmn.vars.json", "{}");
        expect(onChange).toHaveBeenCalledTimes(3);
    });

    it("disposes the underlying watcher handle", async () => {
        const onChange = vi.fn();
        const handle = await service().createWatcher(DOCUMENT, onChange);
        handle.dispose();

        await ws.writeFile(MANIFEST_PATH, "{}");
        expect(onChange).not.toHaveBeenCalled();
    });

    describe("upsert", () => {
        it("creates the manifest under <configFolder>/vars/ when absent and returns its path", async () => {
            const manifestPath = await service().upsert(DOCUMENT, { name: "orderId" });

            expect(manifestPath).toBe(MANIFEST_PATH);
            expect(JSON.parse(ws.files.get(MANIFEST_PATH)!)).toEqual({
                variables: [{ name: "orderId" }],
            });
            // Trailing newline so the file is POSIX-clean and diffs minimally.
            expect(ws.files.get(MANIFEST_PATH)!.endsWith("}\n")).toBe(true);
        });

        it("appends to an existing manifest, preserving order and unknown fields", async () => {
            ws.files.set(
                MANIFEST_PATH,
                JSON.stringify({
                    $schema: "./vars.schema.json",
                    variables: [{ name: "orderId", type: "String" }],
                }),
            );

            await service().upsert(DOCUMENT, { name: "amount" });

            expect(JSON.parse(ws.files.get(MANIFEST_PATH)!)).toEqual({
                $schema: "./vars.schema.json",
                variables: [{ name: "orderId", type: "String" }, { name: "amount" }],
            });
        });

        it("is a no-op when an entry with that name already exists", async () => {
            ws.files.set(
                MANIFEST_PATH,
                JSON.stringify({ variables: [{ name: "orderId", type: "String" }] }),
            );

            await service().upsert(DOCUMENT, { name: "orderId" });

            // The existing typed entry must survive untouched (no nameless overwrite).
            expect(JSON.parse(ws.files.get(MANIFEST_PATH)!)).toEqual({
                variables: [{ name: "orderId", type: "String" }],
            });
        });

        it("propagates a parse error rather than clobbering a malformed manifest", async () => {
            ws.files.set(MANIFEST_PATH, "{ not json");

            await expect(service().upsert(DOCUMENT, { name: "orderId" })).rejects.toThrow();
            // The hand-broken content is left intact for the author to fix.
            expect(ws.files.get(MANIFEST_PATH)).toBe("{ not json");
        });
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
            vi.spyOn(ws, "getDocumentDirectory").mockReturnValue("C:/work");
        });

        it("computes the manifest path from the normalized relative path", async () => {
            ws.files.set(
                WINDOWS_MANIFEST_PATH,
                JSON.stringify({ variables: [{ name: "orderId", type: "String" }] }),
            );

            const vars = await service().load(WINDOWS_DOCUMENT);

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
            const createWatcher = vi.spyOn(ws, "createWatcher");
            await service().createWatcher(WINDOWS_DOCUMENT, vi.fn());

            const [rootPath, glob] = createWatcher.mock.calls[0];
            expect(rootPath).toBe("C:/work");
            // Relative path is clean (`diagram.bpmn.vars.json`), proving the path
            // is computed in posix space rather than from the backslash raw path.
            expect(glob).toBe("**/.camunda/vars/diagram.bpmn.vars.json");
        });
    });
});
