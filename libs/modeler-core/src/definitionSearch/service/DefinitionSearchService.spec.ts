import { describe, expect, it, vi } from "vitest";

import {
    SearchWorkspaceDefinitionsCommand,
    WorkspaceDefinitionsQuery,
} from "@miragon/bpmn-modeler-shared";

import { createTestHost, type WorkspaceWatcher } from "../../testing";
import { DefinitionSearchService } from "./DefinitionSearchService";
import { WorkspaceDefinitionIndex } from "./WorkspaceDefinitionIndex";

function model(definitions: string, usage = ""): string {
    return `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:process id="p">${usage}</bpmn:process>${definitions}</bpmn:definitions>`;
}

function setup(initialFiles: Record<string, string>) {
    const host = createTestHost({ folders: ["/work"], files: initialFiles });
    const editor = host.openEditor("/work/current.bpmn");
    const findFiles = vi.spyOn(host.workspace, "findFiles");
    const readFile = vi.spyOn(host.workspace, "readFile");
    const index = new WorkspaceDefinitionIndex(host.workspace, host.notifier);
    const service = new DefinitionSearchService(
        host.store,
        host.documents,
        host.workspace,
        index,
        host.notifier,
    );

    const answer = async (kind: "message" | "signal" | "error" | "escalation", text: string) => {
        const postedBefore = editor.posted.length;
        await service.search(editor.id, new SearchWorkspaceDefinitionsCommand(7, kind, text));
        const answers = editor.posted.slice(postedBefore) as WorkspaceDefinitionsQuery[];
        expect(answers.map(({ type }) => type)).toEqual(["WorkspaceDefinitionsQuery"]);
        expect(answers[0].requestId).toBe(7);
        return answers[0];
    };
    const search = async (kind: "message" | "signal" | "error" | "escalation", text: string) =>
        (await answer(kind, text)).definitions;

    return {
        host,
        editor,
        findFiles,
        readFile,
        service,
        answer,
        search,
    };
}

function liveWatcherRoots(watchers: readonly WorkspaceWatcher[]): string[] {
    return watchers.filter(({ disposed }) => !disposed).map(({ root }) => root);
}

describe("DefinitionSearchService", () => {
    it("finds matching definitions in other models with their file and usages", async () => {
        const { search } = setup({
            "/work/current.bpmn": model('<bpmn:message id="M0" name="paid" />'),
            "/work/billing/pay.bpmn": model(
                '<bpmn:message id="M1" name="paid" /><bpmn:message id="M2" name="refunded" />',
                '<bpmn:endEvent id="E" name="Paid"><bpmn:messageEventDefinition messageRef="M1" /></bpmn:endEvent>',
            ),
        });

        expect(await search("message", "PAI")).toEqual([
            {
                kind: "message",
                name: "paid",
                code: undefined,
                source: { path: "billing/pay.bpmn", label: "pay.bpmn" },
                usages: [
                    { elementId: "E", elementName: "Paid", elementType: "endEvent", role: "throw" },
                ],
            },
        ]);
    });

    it("lists every definition of the kind for an empty query, sorted by name", async () => {
        const { search } = setup({
            "/work/a.bpmn": model(
                '<bpmn:signal id="S1" name="zeta" /><bpmn:message id="M" name="m" />',
            ),
            "/work/b.bpmn": model('<bpmn:signal id="S2" name="alpha" />'),
        });

        expect((await search("signal", "")).map(({ name }) => name)).toEqual(["alpha", "zeta"]);
    });

    it("re-reads a changed file and forgets a deleted one", async () => {
        const { host, findFiles, search } = setup({
            "/work/a.bpmn": model('<bpmn:message id="M" name="before" />'),
            "/work/b.bpmn": model('<bpmn:message id="M" name="other" />'),
        });
        await search("message", "");

        await host.workspace.writeFile(
            "/work/a.bpmn",
            model('<bpmn:message id="M" name="after" />'),
        );
        host.workspace.deleteFile("/work/b.bpmn");

        expect((await search("message", "")).map(({ name }) => name)).toEqual(["after"]);
        expect(findFiles).toHaveBeenCalledTimes(1);
    });

    it("forgets the files of a folder deleted as one event", async () => {
        const { host, search } = setup({
            "/work/models/order.bpmn": model('<bpmn:message id="M1" name="ordered" />'),
            "/work/models/sub/ship.bpmn": model('<bpmn:message id="M2" name="shipped" />'),
            "/work/pay.bpmn": model('<bpmn:message id="M3" name="paid" />'),
        });
        await search("message", "");

        await host.workspace.deleteDirectory("/work/models");

        expect((await search("message", "")).map(({ name }) => name)).toEqual(["paid"]);
    });

    it("lists the files of a folder created as one event", async () => {
        const { host, search } = setup({
            "/work/pay.bpmn": model('<bpmn:message id="M3" name="paid" />'),
        });
        await search("message", "");

        host.workspace.createDirectory("/work/models", {
            "/work/models/sub/order.bpmn": model('<bpmn:message id="M1" name="ordered" />'),
        });

        expect((await search("message", "")).map(({ name }) => name)).toEqual(["ordered", "paid"]);
    });

    it("lists the files no more often after a deletion", async () => {
        const { host, findFiles, search } = setup({
            "/work/models/order.bpmn": model('<bpmn:message id="M1" name="ordered" />'),
            "/work/pay.bpmn": model('<bpmn:message id="M3" name="paid" />'),
            "/work/src/Worker.java": "",
        });
        await search("message", "");

        host.workspace.deleteFile("/work/src/Worker.java");
        await host.workspace.deleteDirectory("/work/models");

        expect((await search("message", "")).map(({ name }) => name)).toEqual(["paid"]);
        expect(findFiles).toHaveBeenCalledTimes(1);
    });

    it("reads the files of a folder replaced as a whole afresh", async () => {
        const { host, search } = setup({
            "/work/models/order.bpmn": model('<bpmn:message id="M1" name="ordered" />'),
        });
        await search("message", "");

        await host.workspace.deleteDirectory("/work/models");
        host.workspace.createDirectory("/work/models", {
            "/work/models/order.bpmn": model('<bpmn:message id="M1" name="placed" />'),
        });

        expect((await search("message", "")).map(({ name }) => name)).toEqual(["placed"]);
    });

    it("serves repeated searches from the index", async () => {
        const { findFiles, readFile, search } = setup({
            "/work/a.bpmn": model('<bpmn:message id="M" name="x" />'),
        });

        await search("message", "x");
        await search("message", "");

        expect(findFiles).toHaveBeenCalledTimes(1);
        expect(readFile).toHaveBeenCalledTimes(1);
    });

    it("answers a failed search as failed, and retries on the next search", async () => {
        const { host, findFiles, answer, search } = setup({
            "/work/a.bpmn": model('<bpmn:message id="M" name="x" />'),
        });
        const scanFailure = new Error("boom");
        findFiles.mockRejectedValueOnce(scanFailure);

        expect(await answer("message", "")).toMatchObject({ definitions: [], failed: true });
        expect(host.notifier.logged("error")).toEqual([scanFailure.stack]);
        expect(await search("message", "")).toHaveLength(1);
    });

    it("lists again after a listing that failed while a file was deleted", async () => {
        const { host, findFiles, answer, search } = setup({
            "/work/a.bpmn": model('<bpmn:message id="M" name="x" />'),
            "/work/b.bpmn": model('<bpmn:message id="M" name="y" />'),
        });
        let failListing!: (error: Error) => void;
        findFiles.mockReturnValueOnce(new Promise((_, reject) => (failListing = reject)));
        const failedSearch = answer("message", "");

        host.workspace.deleteFile("/work/b.bpmn");
        failListing(new Error("boom"));

        expect(await failedSearch).toMatchObject({ definitions: [], failed: true });
        expect((await search("message", "")).map(({ name }) => name)).toEqual(["x"]);
    });

    it("answers a malformed search as failed without touching the workspace", async () => {
        const { findFiles, answer } = setup({});

        expect(await answer("bogus" as "message", "x")).toMatchObject({ failed: true });
        expect(findFiles).not.toHaveBeenCalled();
    });

    it("finds definitions in a workspace folder added after the first search", async () => {
        const { host, search } = setup({
            "/work/current.bpmn": model(""),
            "/work/pay.bpmn": model('<bpmn:message id="M1" name="paid" />'),
            "/shared/ship.bpmn": model('<bpmn:message id="M2" name="shipped" />'),
        });
        await search("message", "");

        host.workspace.addFolder("/shared");

        expect((await search("message", "")).map(({ name }) => name)).toEqual(["paid", "shipped"]);
    });

    it("keeps an added folder's models current", async () => {
        const { host, search } = setup({
            "/work/pay.bpmn": model('<bpmn:message id="M1" name="paid" />'),
            "/shared/ship.bpmn": model('<bpmn:message id="M2" name="shipped" />'),
        });
        await search("message", "");
        host.workspace.addFolder("/shared");
        await search("message", "");

        await host.workspace.writeFile(
            "/shared/ship.bpmn",
            model('<bpmn:message id="M2" name="dispatched" />'),
        );

        expect((await search("message", "")).map(({ name }) => name)).toEqual([
            "dispatched",
            "paid",
        ]);
    });

    it("stops listing definitions of a removed workspace folder", async () => {
        const { host, search } = setup({
            "/work/pay.bpmn": model('<bpmn:message id="M1" name="paid" />'),
            "/shared/ship.bpmn": model('<bpmn:message id="M2" name="shipped" />'),
        });
        host.workspace.addFolder("/shared");
        await search("message", "");

        host.workspace.removeFolder("/shared");

        expect((await search("message", "")).map(({ name }) => name)).toEqual(["paid"]);
        expect(liveWatcherRoots(host.workspace.watchers)).toEqual(["/work"]);
    });

    it("stops watching once the last editor of the scope is released", async () => {
        const { host, service, editor, search } = setup({});
        await search("message", "");

        service.releaseEditor(editor.id);

        expect(host.workspace.watchers.map((watcher) => watcher.disposed)).toEqual([true]);
    });
});
