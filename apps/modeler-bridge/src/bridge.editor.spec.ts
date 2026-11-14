import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DOCUMENT_SYNC_COMMAND_TYPES } from "@miragon/bpmn-modeler-core";

import { hostNotification, registerParams, waitForFrame } from "./__fixtures__/bridgeHarness";
import { createBridge } from "./composition/bridge";

describe("the bridge's BPMN editor", () => {
    it("delivers the host's follow-name choice, and pushes a changed one", async () => {
        const root = await fs.mkdtemp(join(tmpdir(), "bridge-element-ids-"));
        roots.push(root);
        const frames: Array<{
            method: string;
            params?: {
                editorId?: string;
                message?: {
                    type: string;
                    setting?: { elementIdsFollowName?: boolean };
                };
            };
        }> = [];
        const { rpc } = createBridge((line) => frames.push(JSON.parse(line)));
        const editorId = `file://${join(root, "ids.bpmn")}`;
        const settingQueries = () =>
            frames
                .filter(
                    (frame) =>
                        frame.params?.editorId === editorId &&
                        frame.params.message?.type === "BpmnModelerSettingQuery",
                )
                .map((frame) => frame.params?.message?.setting);
        await rpc.handleLine(
            hostNotification(
                "session/register",
                registerParams(editorId, root, editorId.slice(7), "", {
                    settings: { elementIdsFollowName: false },
                }),
            ),
        );
        await rpc.handleLine(
            hostNotification("webview/message", {
                editorId,
                message: { type: "GetBpmnModelerSettingCommand" },
            }),
        );

        expect(settingQueries()).toMatchObject([{ elementIdsFollowName: false }]);

        await rpc.handleLine(
            hostNotification("settings/didChange", { settings: { elementIdsFollowName: true } }),
        );
        await waitForFrame(
            frames,
            (frame) =>
                frame.params?.editorId === editorId &&
                frame.params.message?.setting?.elementIdsFollowName === true,
        );

        expect(settingQueries().slice(-1)[0]).toMatchObject({ elementIdsFollowName: true });
        await rpc.handleLine(hostNotification("session/dispose", { editorId }));
    });

    it("delivers the same automatic preview setting to two live editors and on reload", async () => {
        const root = await fs.mkdtemp(join(tmpdir(), "bridge-preview-"));
        roots.push(root);
        const frames: Array<{
            method: string;
            params?: {
                editorId?: string;
                message?: { type: string; formPreviewAutomatic?: boolean };
            };
        }> = [];
        const { rpc } = createBridge((line) => frames.push(JSON.parse(line)));
        const ids = ["first", "second"].map((name) => `file://${join(root, `${name}.bpmn`)}`);
        for (const editorId of ids) {
            await rpc.handleLine(
                hostNotification(
                    "session/register",
                    registerParams(editorId, root, editorId.slice(7), "", {
                        settings: { formPreviewAutomatic: false },
                    }),
                ),
            );
            await rpc.handleLine(
                hostNotification("webview/message", {
                    editorId,
                    message: { type: "GetBpmnModelerSettingCommand" },
                }),
            );
        }
        for (const editorId of ids) {
            expect(
                frames.some(
                    (frame) =>
                        frame.params?.editorId === editorId &&
                        frame.params.message?.type === "BpmnModelerSettingQuery" &&
                        frame.params.message.formPreviewAutomatic === false,
                ),
            ).toBe(true);
        }
        frames.length = 0;
        await rpc.handleLine(
            hostNotification("settings/didChange", { settings: { formPreviewAutomatic: true } }),
        );
        for (const editorId of ids) {
            await waitForFrame(
                frames,
                (frame) =>
                    frame.params?.editorId === editorId &&
                    frame.params.message?.type === "BpmnModelerSettingQuery" &&
                    frame.params.message.formPreviewAutomatic === true,
            );
        }
        frames.length = 0;
        await rpc.handleLine(
            hostNotification("settings/didChange", { settings: { formPreviewAutomatic: true } }),
        );
        expect(
            frames.filter((frame) => frame.params?.message?.type === "BpmnModelerSettingQuery"),
        ).toEqual([]);
        await rpc.handleLine(
            hostNotification("webview/message", {
                editorId: ids[0],
                message: { type: "GetBpmnModelerSettingCommand" },
            }),
        );
        expect(
            frames.find((frame) => frame.params?.message?.type === "BpmnModelerSettingQuery")
                ?.params?.message?.formPreviewAutomatic,
        ).toBe(true);
        for (const editorId of ids)
            await rpc.handleLine(hostNotification("session/dispose", { editorId }));
    });
    const roots: string[] = [];
    afterEach(async () => {
        await Promise.all(
            roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
        );
    });

    it("routes the whole document group to the core's document services", () => {
        const { surfaceRoutes } = createBridge(() => {});

        expect(
            DOCUMENT_SYNC_COMMAND_TYPES.map((type) => surfaceRoutes.bpmnEditor?.routeOf(type)),
        ).toEqual([{ kind: "handled" }, { kind: "handled" }, { kind: "handled" }]);
    });

    it("opens the properties panel visible, since IntelliJ keeps no panel visibility", async () => {
        const root = await fs.mkdtemp(join(tmpdir(), "bridge-editor-"));
        roots.push(root);
        const bpmnPath = join(root, "order.bpmn");
        const editorId = `file://${bpmnPath}`;
        const frames: { method: string; params: { message?: { type: string } } }[] = [];
        const { rpc } = createBridge((line) => frames.push(JSON.parse(line)));
        await rpc.handleLine(
            hostNotification("session/register", registerParams(editorId, root, bpmnPath, "")),
        );

        await rpc.handleLine(
            hostNotification("webview/message", {
                editorId,
                message: { type: "GetPropertiesPanelStateCommand" },
            }),
        );

        const reply = await waitForFrame(
            frames,
            (frame) =>
                frame.method === "editor/postMessage" &&
                frame.params.message?.type === "PropertiesPanelStateQuery",
        );
        expect(reply.params).toEqual({
            editorId,
            message: { type: "PropertiesPanelStateQuery", visible: true },
        });
    });
});
