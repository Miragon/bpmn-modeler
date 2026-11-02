import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DOCUMENT_SYNC_COMMAND_TYPES } from "@miragon/bpmn-modeler-core";
import { BPMN_EDITOR_COMMAND_TYPES, BpmnEditorCommandType } from "@miragon/bpmn-modeler-shared";

import { hostNotification, registerParams, waitForFrame } from "./__fixtures__/bridgeHarness";
import { createBridge } from "./bridge";

/** How the IntelliJ host serves each command its BPMN editor webview posts. */
const INTELLIJ_COVERAGE: Record<BpmnEditorCommandType, "handled" | "ignored"> = {
    SyncDocumentCommand: "handled",
    DocumentFlushedCommand: "handled",
    LogDebugCommand: "handled",
    LogInfoCommand: "handled",
    LogWarningCommand: "handled",
    LogErrorCommand: "handled",
    ShowInfoCommand: "handled",
    RequestFocusCommand: "handled",
    GetBpmnFileCommand: "handled",
    // IntelliJ has no SVG export, so the webview never sends this reply.
    GetDiagramAsSVGCommand: "ignored",
    GetElementTemplatesCommand: "handled",
    GetBpmnlintConfigCommand: "handled",
    GetBpmnModelerSettingCommand: "handled",
    GetPropertiesPanelStateCommand: "handled",
    SetPropertiesPanelStateCommand: "ignored",
    SetLintingEnabledCommand: "handled",
    UpdateLintResultsCommand: "handled",
    GetClipboardCommand: "handled",
    SetClipboardCommand: "handled",
    GetTextClipboardCommand: "handled",
    SetTextClipboardCommand: "handled",
    NavigateToReferencedModelCommand: "handled",
    NavigateToImplementationCommand: "handled",
    SyncActivitiesCommand: "handled",
    GetFormReferenceStatusCommand: "handled",
    GetFormPreviewCommand: "handled",
    SearchWorkspaceDefinitionsCommand: "handled",
    OpenScriptEditorCommand: "handled",
    OpenScriptEditorsCommand: "handled",
    UpdateScriptSourceCommand: "handled",
    UpdateScriptVariablesCommand: "handled",
    DiagramFormattedCommand: "handled",
    CleanupReportCommand: "handled",
};

describe("the bridge's BPMN editor", () => {
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

    it("routes match the host's coverage table", () => {
        const { editorRoutes } = createBridge(() => {});

        const coverage = Object.fromEntries(
            BPMN_EDITOR_COMMAND_TYPES.map((type) => [type, editorRoutes.routeOf(type).kind]),
        );

        expect(coverage).toEqual(INTELLIJ_COVERAGE);
    });

    it("routes the whole document group to the core's document services", () => {
        const { editorRoutes } = createBridge(() => {});

        expect(DOCUMENT_SYNC_COMMAND_TYPES.map((type) => editorRoutes.routeOf(type))).toEqual([
            { kind: "handled" },
            { kind: "handled" },
            { kind: "handled" },
        ]);
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
