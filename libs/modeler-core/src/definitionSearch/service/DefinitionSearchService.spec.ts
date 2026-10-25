import { describe, expect, it, vi } from "vitest";

import {
    SearchWorkspaceDefinitionsCommand,
    WorkspaceDefinitionsQuery,
} from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../testing";
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
        expect(findFiles).toHaveBeenCalledTimes(2);
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
        findFiles.mockRejectedValueOnce(new Error("boom"));

        expect(await answer("message", "")).toMatchObject({ definitions: [], failed: true });
        expect(host.notifier.logged("error")).toEqual(["boom"]);
        expect(await search("message", "")).toHaveLength(1);
    });

    it("answers a malformed search as failed without touching the workspace", async () => {
        const { findFiles, answer } = setup({});

        expect(await answer("bogus" as "message", "x")).toMatchObject({ failed: true });
        expect(findFiles).not.toHaveBeenCalled();
    });

    it("stops watching once the last editor of the scope is released", async () => {
        const { host, service, editor, search } = setup({});
        await search("message", "");

        service.releaseEditor(editor.id);

        expect(host.workspace.watchers.map((watcher) => watcher.disposed)).toEqual([true]);
    });
});
