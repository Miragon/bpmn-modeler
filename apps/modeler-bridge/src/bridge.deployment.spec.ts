import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    contentFingerprint,
    DeploymentTargetIdentity,
    FetchHttpClient,
    ledgerKeyFor,
    NO_ENV_VARIABLES,
} from "@miragon/bpmn-modeler-core";
import { DeployCommand } from "@miragon/bpmn-modeler-shared";
import {
    hostErrorReply,
    hostNotification,
    hostReply,
    isStatusSlotUpdate,
    registerParams,
    StatusSlotFrame,
    waitForFrame,
} from "./__fixtures__/bridgeHarness";
import { createBridge } from "./bridge";
import { buildSharedDeps } from "./composition/sharedDeps";
import { register } from "./composition/deploymentFeature";
import { METHODS } from "./protocol/descriptor";
import type {
    DeploymentSaveParams,
    DeploymentSeedParams,
    PickerShowParams,
    StatusBarUpdateParams,
} from "./protocol/types";

/** The `deploymentState/save` that records ledger rows, the last step of an accepted deploy. */
function isLedgerRowSave(frame: { method?: string; params?: unknown }): boolean {
    return (
        frame.method === METHODS.deploymentStateSave &&
        (frame.params as DeploymentSaveParams).patch.ledger?.put !== undefined
    );
}

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
        let confirm = () => true;
        const hostErrors = new Map<string, string>();
        const deps = buildSharedDeps(
            (line) => {
                const frame: (typeof frames)[number] = JSON.parse(line);
                frames.push(frame);
                const hostError = hostErrors.get(frame.method);
                if (frame.id !== undefined && hostError !== undefined) {
                    void deps.rpc.handleLine(JSON.stringify({ id: frame.id, error: hostError }));
                } else if (frame.id !== undefined) {
                    const result =
                        frame.method === METHODS.pickerShow
                            ? { selected: pick(frame.params as PickerShowParams) }
                            : frame.method === METHODS.confirmShow
                              ? { confirmed: confirm() }
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
            setConfirm: (fn: typeof confirm) => {
                confirm = fn;
            },
            failHostRequest: (method: string, error: string) => {
                hostErrors.set(method, error);
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
        expect(c.frames.some(isLedgerRowSave)).toBe(true);
        expect(c.deps.nodeWorkspace.getWorkspaceFolderPaths()).toEqual([]);
    });

    it("asks before sending a target's credentials to a host not approved for them, and remembers the answer", async () => {
        const c = await setup();
        await c.seed("dev");
        await c.command(METHODS.deploymentDeployFiles);

        const confirmation = c.frames.find((frame) => frame.method === METHODS.confirmShow)!;
        expect((confirmation.params as { title: string }).title).toContain("https://root.test");
        expect(
            c.frames.find((frame) => frame.method === METHODS.secretStoreSaveApprovedDestinations)
                ?.params,
        ).toEqual({
            slot: `${c.root}/.camunda/deployment-targets.json::dev`,
            origins: ["https://root.test"],
        });
    });

    it("sends nothing when the user declines a host not approved for the credentials", async () => {
        const c = await setup();
        c.setConfirm(() => false);
        await c.seed("dev");
        await c.command(METHODS.deploymentDeployFiles);

        expect(c.post).not.toHaveBeenCalled();
        expect(
            c.frames.some((frame) => frame.method === METHODS.secretStoreSaveApprovedDestinations),
        ).toBe(false);
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

    const DIAGRAM = '<bpmn:process id="order"/>';

    /** Focuses a fake editor on `<root>/order.bpmn` with a parseable diagram. */
    function focusEditor(c: Awaited<ReturnType<typeof setup>>) {
        vi.spyOn(c.deps.store, "getActiveEditorId").mockReturnValue("editor");
        vi.spyOn(c.deps.documentPort, "getFilePath").mockReturnValue(join(c.root, "order.bpmn"));
        vi.spyOn(c.deps.documentPort, "getContent").mockReturnValue(DIAGRAM);
    }

    function mockEngineLookup() {
        return vi
            .spyOn(FetchHttpClient.prototype, "getJson")
            .mockImplementation(async (url: string) => {
                if (url.includes("/process-definition/key/")) {
                    return {
                        status: 200,
                        body: JSON.stringify({
                            id: "order:1:def-1",
                            deploymentId: "dep-9",
                            resource: "order.bpmn",
                        }),
                    };
                }
                if (url.endsWith("/xml")) {
                    return { status: 200, body: JSON.stringify({ bpmn20Xml: DIAGRAM }) };
                }
                return {
                    status: 200,
                    body: JSON.stringify({ deploymentTime: "2026-09-17T14:40:00.000Z" }),
                };
            });
    }

    it("verifies against the engine and adopts the revision into the ledger", async () => {
        const c = await setup();
        await c.seed("dev");
        focusEditor(c);
        const getJson = mockEngineLookup();

        await c.command(METHODS.deploymentVerify);

        expect(getJson.mock.calls[0][0]).toBe("https://root.test/process-definition/key/order");
        const save = c.frames.find(isLedgerRowSave)!;
        expect(
            Object.values((save.params as DeploymentSaveParams).patch.ledger?.put ?? {}),
        ).toEqual([expect.objectContaining({ deploymentId: "dep-9", origin: "engine" })]);
        expect(c.frames.some((frame) => frame.method === METHODS.notifierShowInfo)).toBe(true);
        expect(c.deps.nodeWorkspace.getWorkspaceFolderPaths()).toEqual([]);
    });

    it("routes the status-bar menu's verify entry into a verification", async () => {
        const c = await setup();
        await c.seed("dev");
        focusEditor(c);
        const getJson = mockEngineLookup();
        c.setPicker((params) => {
            expect(params.items.map((item: { label: string }) => item.label)).toEqual([
                "Switch deployment target…",
                "Verify on dev",
            ]);
            return [1];
        });

        await c.command(METHODS.deploymentStatusBarMenu);

        expect(getJson).toHaveBeenCalled();
        expect(c.deps.nodeWorkspace.getWorkspaceFolderPaths()).toEqual([]);
    });

    it("routes the status-bar menu's switch entry into the target picker", async () => {
        const c = await setup();
        await c.seed("dev");
        const shown: string[][] = [];
        c.setPicker((params) => {
            shown.push(params.items.map((item: { label: string }) => item.label));
            // Dismiss whichever picker opens; only the sequence matters here.
            return null;
        });

        await c.command(METHODS.deploymentStatusBarMenu);
        c.setPicker((params) => {
            shown.push(params.items.map((item: { label: string }) => item.label));
            return params.items[0].label.startsWith("Switch") ? [0] : null;
        });
        await c.command(METHODS.deploymentStatusBarMenu);

        expect(shown[0]).toEqual(["Switch deployment target…", "Verify on dev"]);
        expect(shown[shown.length - 1]).toEqual(["(none — use form values)", "dev"]);
    });

    it("saves and deploys the active diagram to the active target", async () => {
        const c = await setup();
        await c.seed("dev");
        focusEditor(c);
        const save = vi.spyOn(c.deps.documentPort, "save").mockResolvedValue(true);

        await c.command(METHODS.deploymentDeployActive);

        expect(save).toHaveBeenCalledWith("editor");
        expect(c.post.mock.calls[0][0]).toBe("https://root.test/deployment/create");
        expect(c.frames.some((frame) => frame.method === METHODS.pickerShow)).toBe(false);
        expect(c.deps.nodeWorkspace.getWorkspaceFolderPaths()).toEqual([]);
    });

    it.each([
        {
            trigger: "Deploy Diagram",
            deploy: (root: string) =>
                hostNotification(METHODS.deploymentDeployActive, { workspaceRoot: root }),
        },
        {
            trigger: "the sidebar's Deploy",
            deploy: (_root: string, diagramPath: string) =>
                hostNotification(METHODS.deploymentWebviewMessage, {
                    message: new DeployCommand({
                        deploymentName: "order",
                        tenantId: "",
                        endpoint: "https://root.test",
                        engine: "c7",
                        mainFilePath: diagramPath,
                        additionalFilePaths: [],
                        auth: { authType: "none" },
                        targetName: "dev",
                    }),
                }),
        },
    ])(
        "flushes the webview's pending edits into the document before $trigger saves the active diagram",
        async ({ deploy }) => {
            const root = await fs.mkdtemp(join(tmpdir(), "deployment-flush-"));
            roots.push(root);
            const diagramPath = join(root, "order.bpmn");
            await fs.writeFile(diagramPath, DIAGRAM);
            await fs.mkdir(join(root, ".camunda"));
            await fs.writeFile(
                join(root, ".camunda/deployment-targets.json"),
                JSON.stringify({
                    targets: [
                        {
                            name: "dev",
                            endpoint: "https://root.test",
                            engine: "c7",
                            auth: { type: "none" },
                        },
                    ],
                }),
            );
            const post = vi.spyOn(FetchHttpClient.prototype, "postMultipart").mockResolvedValue({
                status: 200,
                body: '{"id":"deployment-1"}',
            });
            const frames: {
                method: string;
                params: { content?: string; message?: { type: string; token: number } };
                id?: number;
            }[] = [];
            const { rpc } = createBridge((line) => {
                const frame: (typeof frames)[number] = JSON.parse(line);
                frames.push(frame);
                if (frame.id === undefined) return;
                const result =
                    frame.method === METHODS.documentWrite
                        ? { changed: true, accepted: true }
                        : frame.method === METHODS.documentSave
                          ? { saved: true }
                          : null;
                void rpc.handleLine(hostReply(frame.id, result));
            });
            const editorId = `file://${diagramPath}`;
            const editedDiagram = DIAGRAM.replace('id="order"', 'id="order_edited"');
            await rpc.handleLine(
                hostNotification(
                    METHODS.sessionRegister,
                    registerParams(editorId, root, diagramPath, DIAGRAM),
                ),
            );
            await rpc.handleLine(
                hostNotification(METHODS.deploymentStateSeed, {
                    state: { activeTargetName: "dev" },
                }),
            );
            const fromIndex = frames.length;
            const isFlushQuery = (frame: (typeof frames)[number]) =>
                frame.method === METHODS.editorPostMessage &&
                frame.params.message?.type === "FlushDocumentQuery";

            const deploying = rpc.handleLine(deploy(root, diagramPath));
            const flushOrSave = await waitForFrame(
                frames,
                (frame) => isFlushQuery(frame) || frame.method === METHODS.documentSave,
                { fromIndex },
            );
            expect(flushOrSave.method).toBe(METHODS.editorPostMessage);
            await rpc.handleLine(
                hostNotification(METHODS.webviewMessage, {
                    editorId,
                    message: {
                        type: "DocumentFlushedCommand",
                        token: flushOrSave.params.message.token,
                        content: editedDiagram,
                        status: "flushed",
                        documentRevision: 0,
                    },
                }),
            );
            await deploying;
            // The sidebar's deploy runs detached from its RPC notification.
            await waitForFrame(frames, isLedgerRowSave, { fromIndex });

            expect(post).toHaveBeenCalledOnce();
            const handOffs = frames.slice(fromIndex).flatMap((frame) => {
                if (isFlushQuery(frame)) return ["flush"];
                if (frame.method === METHODS.documentWrite)
                    return [`write ${frame.params.content}`];
                if (frame.method === METHODS.documentSave) return ["save"];
                return [];
            });
            expect(handOffs).toEqual(["flush", `write ${editedDiagram}`, "save"]);
        },
    );

    it("reports a form deploy the engine accepted as succeeded when PasswordSafe fails to store the credentials", async () => {
        const c = await setup();
        c.failHostRequest(METHODS.secretStoreSaveBasicAuth, "PasswordSafe unavailable");
        await c.seed("dev");
        focusEditor(c);
        vi.spyOn(c.deps.documentPort, "save").mockResolvedValue(true);
        const deploy = new DeployCommand({
            deploymentName: "order",
            tenantId: "",
            endpoint: "https://root.test",
            engine: "c7",
            mainFilePath: join(c.root, "order.bpmn"),
            additionalFilePaths: [],
            auth: { authType: "basic", username: "admin", password: "secret" },
            targetName: "dev",
        });

        await c.deps.rpc.handleLine(
            JSON.stringify({
                method: METHODS.deploymentWebviewMessage,
                params: { message: deploy },
            }),
        );

        const posted = await waitForFrame(
            c.frames,
            (frame) =>
                frame.method === METHODS.deploymentPostMessage &&
                frame.params.message.type === "DeploymentResultQuery",
        );
        expect(posted.params.message).toMatchObject({
            success: true,
            deploymentId: "deployment-1",
        });
        expect(posted.params.message.message).toContain("PasswordSafe unavailable");
        expect(c.frames.some(isLedgerRowSave)).toBe(true);
    });

    it("reports and deploys nothing when no diagram is focused", async () => {
        const c = await setup();
        await c.seed("dev");

        await c.command(METHODS.deploymentDeployActive);

        expect(c.post).not.toHaveBeenCalled();
        expect(c.frames.some((frame) => frame.method === METHODS.notifierShowInfo)).toBe(true);
        expect(c.deps.nodeWorkspace.getWorkspaceFolderPaths()).toEqual([]);
    });

    it("surfaces command failures and still releases the root", async () => {
        const c = await setup();
        await c.seed("dev");
        vi.spyOn(c.deps.nodeWorkspace, "findFiles").mockRejectedValue(
            new Error("discovery failed"),
        );
        await c.command(METHODS.deploymentDeployFiles);
        const errorBalloon = c.frames.find((frame) => frame.method === METHODS.notifierShowError);
        expect(errorBalloon?.params).toEqual({
            message: expect.stringMatching(/\ndiscovery failed$/),
        });
        expect(c.deps.nodeWorkspace.getWorkspaceFolderPaths()).toEqual([]);
    });

    describe("the host's deployment status slot", () => {
        const FORM_ENDPOINT = "https://form.test/engine-rest";

        /** The host shows one deployment widget, so the last update of its slot is what it shows now. */
        function shownDeploymentStatus(
            frames: readonly StatusSlotFrame[],
        ): StatusBarUpdateParams["view"] | undefined {
            const updates = frames.filter(isStatusSlotUpdate("deploymentTarget"));
            return updates[updates.length - 1]?.params?.view;
        }

        /** Opens a diagram in a workspace without a targets file, after the host seeded its state. */
        async function openDiagramWithSeed(
            seedFor: (diagramPath: string) => DeploymentSeedParams["state"],
        ): Promise<StatusSlotFrame[]> {
            const root = await fs.mkdtemp(join(tmpdir(), "deployment-status-"));
            roots.push(root);
            const diagramPath = join(root, "order.bpmn");
            await fs.writeFile(diagramPath, DIAGRAM);
            const frames: StatusSlotFrame[] = [];
            const { rpc } = createBridge((line) => frames.push(JSON.parse(line)));
            await rpc.handleLine(
                hostNotification(METHODS.deploymentStateSeed, { state: seedFor(diagramPath) }),
            );
            await rpc.handleLine(
                hostNotification(
                    METHODS.sessionRegister,
                    registerParams(`file://${diagramPath}`, root, diagramPath, DIAGRAM),
                ),
            );
            return frames;
        }

        it("asks for a target while no connection is saved", async () => {
            const frames = await openDiagramWithSeed(() => ({ activeTargetName: "" }));

            await vi.waitFor(() =>
                expect(shownDeploymentStatus(frames)).toEqual({
                    text: "No deployment target",
                    icon: "dot",
                    tooltip: "No deployment target selected — click to choose one",
                    tone: "neutral",
                    action: "deploymentMenu",
                }),
            );
        });

        it("labels the form values a sidebar deploy saved and recorded", async () => {
            const frames = await openDiagramWithSeed((diagramPath) => ({
                activeTargetName: "",
                endpoint: FORM_ENDPOINT,
                tenantId: "",
                ledger: {
                    [ledgerKeyFor(
                        DeploymentTargetIdentity.adHoc(FORM_ENDPOINT, "", NO_ENV_VARIABLES),
                        diagramPath,
                    )]: {
                        fingerprint: contentFingerprint(DIAGRAM),
                        deployedAt: "2026-09-17T14:40:00.000Z",
                    },
                },
            }));

            await vi.waitFor(() =>
                expect(shownDeploymentStatus(frames)).toEqual({
                    text: "Form values",
                    icon: "dot",
                    tooltip: expect.stringMatching(
                        /^Deployed with the form values — last deployed \S/,
                    ),
                    tone: "success",
                    action: "deploymentMenu",
                }),
            );
        });

        it("keeps showing a diagram as never deployed when the host rejects recording its verified revision", async () => {
            const neverDeployedOnDev = {
                text: "dev",
                icon: "dot",
                tooltip: "Never deployed to this target from this machine — click to switch target",
                tone: "neutral",
                action: "deploymentMenu",
            };
            const root = await fs.mkdtemp(join(tmpdir(), "deployment-status-"));
            roots.push(root);
            const diagramPath = join(root, "order.bpmn");
            await fs.writeFile(diagramPath, DIAGRAM);
            await fs.mkdir(join(root, ".camunda"));
            await fs.writeFile(
                join(root, ".camunda/deployment-targets.json"),
                JSON.stringify({
                    targets: [
                        {
                            name: "dev",
                            endpoint: "https://root.test",
                            engine: "c7",
                            auth: { type: "none" },
                        },
                    ],
                }),
            );
            mockEngineLookup();
            const frames: (StatusSlotFrame & { id?: number })[] = [];
            const { rpc } = createBridge((line) => {
                const frame: (typeof frames)[number] = JSON.parse(line);
                frames.push(frame);
                if (frame.id === undefined) return;
                void rpc.handleLine(
                    isLedgerRowSave(frame)
                        ? hostErrorReply(frame.id, "disk full")
                        : hostReply(frame.id, null),
                );
            });
            await rpc.handleLine(
                hostNotification(METHODS.deploymentStateSeed, {
                    state: { activeTargetName: "dev" },
                }),
            );
            await rpc.handleLine(
                hostNotification(
                    METHODS.sessionRegister,
                    registerParams(`file://${diagramPath}`, root, diagramPath, DIAGRAM),
                ),
            );
            await vi.waitFor(() =>
                expect(shownDeploymentStatus(frames)).toEqual(neverDeployedOnDev),
            );

            await rpc.handleLine(
                hostNotification(METHODS.deploymentVerify, { workspaceRoot: root }),
            );

            const rejectedWrite = frames.findIndex(isLedgerRowSave);
            expect(rejectedWrite).toBeGreaterThan(-1);
            expect(frames.slice(rejectedWrite).some(isStatusSlotUpdate("deploymentTarget"))).toBe(
                true,
            );
            expect(shownDeploymentStatus(frames)).toEqual(neverDeployedOnDev);
        });
    });
});
