import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DOCUMENT_SYNC_COMMAND_TYPES } from "@miragon/bpmn-modeler-core";

import { hostNotification, registerParams, waitForFrame } from "./__fixtures__/bridgeHarness";
import { createBridge } from "./composition/bridge";

describe("the bridge's BPMN editor", () => {
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
