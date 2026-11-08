import { describe, expect, it } from "vitest";

import { BridgeSettings } from "../../../kernel/adapter/out/BridgeSettings";
import { METHODS } from "../../../protocol/domain/descriptor";
import { SessionMeta } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { DocumentMirror } from "../../domain/DocumentMirror";
import { RpcEditorHandle } from "./RpcEditorHandle";

const META: SessionMeta = {
    editorId: "file:///w/a.bpmn",
    sessionId: 9,
    uriString: "file:///w/a.bpmn",
    path: "/w/a.bpmn",
    fsPath: "/w/a.bpmn",
    scheme: "file",
    workspaceRoot: "/w",
};
const CACHE = "/idea-system/miragon-bpmn-modeler/bpmn-plugins";
const HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function editorHandle() {
    const frames: unknown[] = [];
    const handle = new RpcEditorHandle(
        META,
        new DocumentMirror(),
        new Rpc((line) => frames.push(JSON.parse(line))),
        new BridgeSettings(),
        CACHE,
    );
    return { handle, frames };
}

describe("RpcEditorHandle on the IntelliJ host", () => {
    it("loads a cached plugin file from the page's own origin", () => {
        const { handle } = editorHandle();

        expect(handle.webviewUrlOf(`${CACHE}/${HASH}/plugin.css`)).toBe(
            `/bpmn-plugins/${HASH}/plugin.css`,
        );
    });

    it.each([`/w/.camunda/plugins/resize-tasks/client.js`, `${CACHE}/${HASH}/other.js`])(
        "refuses a URL for %s, which is no plugin file of the cache",
        (path) => {
            const { handle } = editorHandle();

            expect(() => handle.webviewUrlOf(path)).toThrow(path);
        },
    );

    it("asks the host to reload this session's page", () => {
        const { handle, frames } = editorHandle();

        handle.reload();

        expect(frames).toEqual([
            {
                method: METHODS.editorReload,
                params: { editorId: META.editorId, sessionId: META.sessionId },
            },
        ]);
    });
});
