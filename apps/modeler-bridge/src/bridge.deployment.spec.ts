import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchHttpClient } from "@miragon/bpmn-modeler-core";
import { buildSharedDeps } from "./composition/sharedDeps";
import { register } from "./composition/deploymentFeature";
import { METHODS } from "./protocol/descriptor";
import type { PickerShowParams } from "./protocol/types";

describe("deployment commands over the bridge", () => {
    const roots: string[] = [];
    afterEach(async () => {
        vi.restoreAllMocks();
        await Promise.all(
            roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
        );
    });

    async function setup() {
        const root = await fs.mkdtemp(join(tmpdir(), "deployment-command-"));
        roots.push(root);
        await fs.writeFile(join(root, "order.bpmn"), "<process/>");
        const frames: { method: string; params: unknown; id?: number }[] = [];
        let pick: (params: PickerShowParams) => number[] | null = () => [0];
        const deps = buildSharedDeps(
            (line) => {
                const frame: (typeof frames)[number] = JSON.parse(line);
                frames.push(frame);
                if (frame.id !== undefined) {
                    const result =
                        frame.method === METHODS.pickerShow
                            ? { selected: pick(frame.params as PickerShowParams) }
                            : frame.method === METHODS.secretStoreGetBasicAuth
                              ? { username: "test", password: "test" }
                              : null;
                    void deps.rpc.handleLine(JSON.stringify({ id: frame.id, result }));
                }
            },
            () => {},
        );
        register(deps);
        const post = vi
            .spyOn(FetchHttpClient.prototype, "postMultipart")
            .mockResolvedValue({ status: 200, body: '{"id":"deployment-1"}' });
        async function targets(dir: string, endpoint: string, names = ["dev"]) {
            await fs.mkdir(join(dir, ".camunda"), { recursive: true });
            await fs.writeFile(
                join(dir, ".camunda/deployment-targets.json"),
                JSON.stringify({
                    targets: names.map((name) => ({
                        name,
                        endpoint,
                        engine: "c7",
                        auth: { type: "basic" },
                    })),
                }),
            );
        }
        await targets(root, "https://root.test");
        async function seed(name: string) {
            await deps.rpc.handleLine(
                JSON.stringify({
                    method: METHODS.deploymentStateSeed,
                    params: { state: { activeTargetName: name } },
                }),
            );
        }
        async function command(method: string) {
            await deps.rpc.handleLine(JSON.stringify({ method, params: { workspaceRoot: root } }));
        }
        return {
            root,
            deps,
            frames,
            post,
            targets,
            seed,
            command,
            setPicker: (fn: typeof pick) => {
                pick = fn;
            },
        };
    }

    it("discovers and deploys files without an open editor, then releases the root", async () => {
        const c = await setup();
        await c.seed("dev");
        await c.command(METHODS.deploymentDeployFiles);
        const picker = c.frames.find((frame) => frame.method === METHODS.pickerShow)!;
        expect((picker.params as PickerShowParams).items).toEqual([
            { label: "order.bpmn", description: join(c.root, "order.bpmn") },
        ]);
        expect(c.post.mock.calls[0][0]).toBe("https://root.test/deployment/create");
        expect(
            c.frames.some((frame) => frame.method === METHODS.deploymentStateSaveDeployedRevision),
        ).toBe(true);
        expect(c.deps.nodeWorkspace.getWorkspaceFolderPaths()).toEqual([]);
    });

    it("uses the focused diagram's nearest target and secret slot while preserving session roots", async () => {
        const c = await setup();
        const nested = join(c.root, "nested");
        await c.targets(nested, "https://nested.test", ["dev", "nested-only"]);
        c.deps.nodeWorkspace.registerRoot(c.root);
        vi.spyOn(c.deps.store, "getActiveEditorId").mockReturnValue("editor");
        vi.spyOn(c.deps.documentPort, "getFilePath").mockReturnValue(join(nested, "nested.bpmn"));
        vi.spyOn(c.deps.documentPort, "getContent").mockReturnValue("<process/>");
        await c.seed("dev");
        await c.command(METHODS.deploymentDeployFiles);
        expect(c.post.mock.calls[0][0]).toBe("https://nested.test/deployment/create");
        const secretRequest = c.frames.find(
            (frame) => frame.method === METHODS.secretStoreGetBasicAuth,
        )!;
        expect(secretRequest.params).toEqual({
            slot: `${nested}/.camunda/deployment-targets.json::dev`,
        });
        expect(c.deps.nodeWorkspace.getWorkspaceFolderPaths()).toEqual([c.root]);
        c.setPicker(() => [1]);
        await c.command(METHODS.deploymentSwitchTarget);
        const pickers = c.frames.filter((frame) => frame.method === METHODS.pickerShow);
        expect(
            (pickers[pickers.length - 1].params as PickerShowParams).items.map(
                (item: { label: string }) => item.label,
            ),
        ).toEqual(["(none — use form values)", "dev", "nested-only"]);
        expect(c.deps.nodeWorkspace.getWorkspaceFolderPaths()).toEqual([c.root]);
    });

    it.each(["", "dev"])(
        "releases the root after cancelling with active target %s",
        async (name) => {
            const c = await setup();
            await c.seed(name);
            c.setPicker(() => null);
            await c.command(METHODS.deploymentDeployFiles);
            expect(c.post).not.toHaveBeenCalled();
            expect(c.deps.nodeWorkspace.getWorkspaceFolderPaths()).toEqual([]);
        },
    );

    it("surfaces command failures and still releases the root", async () => {
        const c = await setup();
        await c.seed("dev");
        vi.spyOn(c.deps.nodeWorkspace, "findFiles").mockRejectedValue(
            new Error("discovery failed"),
        );
        await c.command(METHODS.deploymentDeployFiles);
        expect(c.frames.some((frame) => frame.method === METHODS.notifierNotifyError)).toBe(true);
        expect(c.deps.nodeWorkspace.getWorkspaceFolderPaths()).toEqual([]);
    });
});
