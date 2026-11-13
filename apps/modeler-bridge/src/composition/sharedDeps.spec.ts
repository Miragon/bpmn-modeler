import { describe, expect, it } from "vitest";

import { RpcEditorHandle } from "../editorSession/adapter/out/RpcEditorHandle";
import { SessionMeta } from "../protocol/domain/types";
import { buildSharedDeps } from "./sharedDeps";

const META: SessionMeta = {
    editorId: "file:///c:/work/order.bpmn",
    sessionId: 1,
    uriString: "file:///c:/work/order.bpmn",
    path: "/c:/work/order.bpmn",
    fsPath: "c:\\work\\order.bpmn",
    scheme: "file",
};

function openOrder() {
    const frames: unknown[] = [];
    const deps = buildSharedDeps(
        (line) => frames.push(JSON.parse(line)),
        () => undefined,
    );
    deps.mirror.register(META, "<definitions/>");
    deps.store.register(
        new RpcEditorHandle(META, deps.mirror, deps.rpc, deps.settings, "/plugin-cache"),
    );
    return { deps, frames };
}

describe("the bridge's documents", () => {
    it("refuse a write at a revision the host has since replaced before a request goes out", async () => {
        const { deps, frames } = openOrder();
        deps.store.setHostDocumentRevision(META.editorId, 2);

        await expect(
            deps.documents.write(META.editorId, '<definitions id="next"/>', 1),
        ).resolves.toBe(false);

        expect(frames).toEqual([]);
    });

    // The core takes posix.dirname of it, as it does of VS Code's canonical path.
    it("read the file's path as the session's /-separated path, not its OS path", () => {
        const { deps } = openOrder();

        expect(deps.documents.getFilePath(META.editorId)).toBe("/c:/work/order.bpmn");
    });
});
