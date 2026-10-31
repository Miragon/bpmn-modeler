import { beforeEach, describe, expect, it, vi } from "vitest";

import { FormReferenceStatusQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost, FakeEditorHandle, type WorkspaceWatcher } from "../../testing";
import { FormReferenceStatusService } from "./FormReferenceStatusService";
import { ReferencedModelLocator } from "./ReferencedModelLocator";

function setup(folders = ["/work"]) {
    const host = createTestHost({ folders });
    const locator = {
        findFormDeclarations: vi.fn().mockResolvedValue({
            kind: "matches",
            declarations: [
                { id: "Form_B", path: "/work/b.form" },
                { id: "Form_A", path: "/work/a.form" },
                { id: "Form_A", path: "/work/duplicate.form" },
            ],
            readFailures: [],
        }),
    };
    const service = new FormReferenceStatusService(
        host.store,
        host.documents,
        host.workspace,
        locator as never,
        host.notifier,
    );
    return { service, host, watchers: host.workspace.watchers, locator };
}

/** Reads the forms of `files` from the workspace fake. */
function setupWithForms(files: Record<string, string>) {
    const host = createTestHost({ folders: ["/work"], files });
    const service = new FormReferenceStatusService(
        host.store,
        host.documents,
        host.workspace,
        new ReferencedModelLocator(host.workspace, host.notifier),
        host.notifier,
    );
    return { service, host, editor: host.openEditor("/work/process.bpmn") };
}

const form = (id: string) => JSON.stringify({ id });

const statuses = (editor: FakeEditorHandle) =>
    editor.postedOfType<FormReferenceStatusQuery>("FormReferenceStatusQuery");

const lastFormIds = (editor: FakeEditorHandle) => statuses(editor).at(-1)?.formIds;

const liveWatcherRoots = (watchers: readonly WorkspaceWatcher[]) =>
    watchers.filter(({ disposed }) => !disposed).map(({ root }) => root);

beforeEach(() => vi.useFakeTimers());

describe("FormReferenceStatusService", () => {
    it("pushes a sorted, deduplicated form-id snapshot on request", async () => {
        const { service, host, watchers } = setup();
        const editor = host.openEditor("/work/process.bpmn");

        await service.requestStatus(editor.id);

        expect(watchers.map(({ root, glob }) => [root, glob])).toEqual([["/work", "**/*.form"]]);
        expect(statuses(editor)).toEqual([new FormReferenceStatusQuery(["Form_A", "Form_B"])]);
    });

    it("refreshes on form changes and suppresses an unchanged watcher push", async () => {
        const { service, host, locator } = setup();
        const editor = host.openEditor("/work/process.bpmn");
        await service.requestStatus(editor.id);

        await host.workspace.writeFile("/work/a.form", "{}");
        await vi.runAllTimersAsync();
        await vi.waitFor(() => expect(locator.findFormDeclarations).toHaveBeenCalledTimes(2));
        expect(editor.posted).toHaveLength(1);

        locator.findFormDeclarations.mockResolvedValue({
            kind: "matches",
            declarations: [{ id: "Form_C", path: "/work/c.form" }],
            readFailures: [],
        });
        await host.workspace.writeFile("/work/c.form", "{}");
        await vi.runAllTimersAsync();
        await vi.waitFor(() => expect(editor.posted).toHaveLength(2));
        expect(statuses(editor)[1]).toEqual(new FormReferenceStatusQuery(["Form_C"]));
    });

    it("refreshes on a form change in a workspace below a build directory", async () => {
        const { service, host, locator } = setup(["/home/u/build/repo"]);
        const editor = host.openEditor("/home/u/build/repo/process.bpmn");
        await service.requestStatus(editor.id);

        locator.findFormDeclarations.mockResolvedValue({
            kind: "matches",
            declarations: [{ id: "Form_C", path: "/home/u/build/repo/c.form" }],
            readFailures: [],
        });
        await host.workspace.writeFile("/home/u/build/repo/c.form", "{}");
        await vi.runAllTimersAsync();

        await vi.waitFor(() => expect(editor.posted).toHaveLength(2));
        expect(statuses(editor)[1]).toEqual(new FormReferenceStatusQuery(["Form_C"]));
    });

    it("ignores a form change inside an excluded directory below the workspace", async () => {
        const { service, host, locator } = setup(["/home/u/build/repo"]);
        const editor = host.openEditor("/home/u/build/repo/process.bpmn");
        await service.requestStatus(editor.id);

        locator.findFormDeclarations.mockResolvedValue({
            kind: "matches",
            declarations: [{ id: "Form_C", path: "/home/u/build/repo/dist/c.form" }],
            readFailures: [],
        });
        await host.workspace.writeFile("/home/u/build/repo/dist/c.form", "{}");
        await vi.runAllTimersAsync();

        expect(statuses(editor)).toEqual([new FormReferenceStatusQuery(["Form_A", "Form_B"])]);
    });

    it("shares one root watcher until the last editor closes", async () => {
        const { service, host, watchers } = setup();
        const first = host.openEditor("/work/a.bpmn");
        const second = host.openEditor("/work/b.bpmn");
        await service.requestStatus(first.id);
        await service.requestStatus(second.id);

        expect(watchers).toHaveLength(1);
        service.disposeEditor(first.id);
        expect(watchers[0].disposed).toBe(false);
        service.disposeEditor(second.id);
        expect(watchers[0].disposed).toBe(true);
    });

    it("watches a workspace folder added before the status is requested again", async () => {
        const { service, host, watchers } = setup(["/work"]);
        const editor = host.openEditor("/work/process.bpmn");
        await service.requestStatus(editor.id);

        host.workspace.addFolder("/forms");
        await service.requestStatus(editor.id);

        expect(liveWatcherRoots(watchers)).toEqual(["/work", "/forms"]);
    });

    it("drops the watcher of a removed workspace folder", async () => {
        const { service, host, watchers } = setup(["/work", "/forms"]);
        const editor = host.openEditor("/work/process.bpmn");
        await service.requestStatus(editor.id);

        host.workspace.removeFolder("/forms");
        await service.requestStatus(editor.id);

        expect(liveWatcherRoots(watchers)).toEqual(["/work"]);
    });

    it("shares one watcher refresh scan across editors with the same search scope", async () => {
        const { service, host, locator } = setup();
        await service.requestStatus(host.openEditor("/work/a.bpmn").id);
        await service.requestStatus(host.openEditor("/work/b.bpmn").id);

        await host.workspace.writeFile("/work/a.form", "{}");
        await vi.runAllTimersAsync();
        await vi.waitFor(() => expect(locator.findFormDeclarations).toHaveBeenCalledTimes(3));
    });

    it("does not share a scan between editors of different search scopes", async () => {
        const { service, host, locator } = setup([]);
        const first = host.openEditor("/first/a.bpmn");
        const second = host.openEditor("/second/b.bpmn");
        let finishFirstScan: (value: unknown) => void = () => {};
        locator.findFormDeclarations.mockReturnValueOnce(
            new Promise((resolve) => {
                finishFirstScan = resolve;
            }),
        );

        const firstRequest = service.requestStatus(first.id);
        await vi.waitFor(() => expect(locator.findFormDeclarations).toHaveBeenCalledOnce());
        const secondRequest = service.requestStatus(second.id);
        await vi.waitFor(() =>
            expect(locator.findFormDeclarations).toHaveBeenLastCalledWith("/second/b.bpmn"),
        );
        finishFirstScan({ kind: "matches", declarations: [], readFailures: [] });
        await Promise.all([firstRequest, secondRequest]);

        expect(statuses(second)).toEqual([new FormReferenceStatusQuery(["Form_A", "Form_B"])]);
    });

    it("does not refresh editors outside the changed loose-file root", async () => {
        const { service, host, locator } = setup([]);
        await service.requestStatus(host.openEditor("/first/a.bpmn").id);
        await service.requestStatus(host.openEditor("/second/b.bpmn").id);

        await host.workspace.writeFile("/first/a.form", "{}");
        await vi.runAllTimersAsync();
        await vi.waitFor(() => expect(locator.findFormDeclarations).toHaveBeenCalledTimes(3));
    });

    it("does not reuse a scope scan that started before a watched change", async () => {
        const { service, host, locator } = setup();
        const firstEditor = host.openEditor("/work/a.bpmn");
        const secondEditor = host.openEditor("/work/b.bpmn");
        await service.requestStatus(firstEditor.id);
        await service.requestStatus(secondEditor.id);
        let finishStaleScan: (value: unknown) => void = () => {};
        locator.findFormDeclarations
            .mockReturnValueOnce(
                new Promise((resolve) => {
                    finishStaleScan = resolve;
                }),
            )
            .mockResolvedValue({
                kind: "matches",
                declarations: [{ id: "Form_Fresh", path: "/work/fresh.form" }],
                readFailures: [],
            });

        const staleRequest = service.requestStatus(firstEditor.id);
        await vi.waitFor(() => expect(locator.findFormDeclarations).toHaveBeenCalledTimes(3));
        await host.workspace.writeFile("/work/fresh.form", "{}");
        await vi.advanceTimersByTimeAsync(150);
        await Promise.resolve();
        const callsAfterChange = locator.findFormDeclarations.mock.calls.length;

        finishStaleScan({
            kind: "matches",
            declarations: [{ id: "Form_Stale", path: "/work/stale.form" }],
            readFailures: [],
        });
        await staleRequest;
        await vi.runAllTimersAsync();
        await vi.waitFor(() =>
            expect(statuses(secondEditor)).toContainEqual(
                new FormReferenceStatusQuery(["Form_Fresh"]),
            ),
        );
        expect(callsAfterChange).toBe(4);
    });

    it("does not block a reopened editor on the disposed session's scan", async () => {
        const { service, host, locator } = setup();
        const editor = host.openEditor("/work/a.bpmn");
        let finishDisposedScan: (value: unknown) => void = () => {};
        locator.findFormDeclarations
            .mockReturnValueOnce(
                new Promise((resolve) => {
                    finishDisposedScan = resolve;
                }),
            )
            .mockResolvedValue({
                kind: "matches",
                declarations: [{ id: "Form_Reopened", path: "/work/reopened.form" }],
                readFailures: [],
            });

        const disposedRequest = service.requestStatus(editor.id);
        await vi.waitFor(() => expect(locator.findFormDeclarations).toHaveBeenCalledOnce());
        service.disposeEditor(editor.id);

        const reopenedRequest = service.requestStatus(editor.id);
        for (let i = 0; i < 5; i++) await Promise.resolve();
        const callsBeforeDisposedScanFinished = locator.findFormDeclarations.mock.calls.length;

        finishDisposedScan({ kind: "matches", declarations: [], readFailures: [] });
        await Promise.all([disposedRequest, reopenedRequest]);

        expect(callsBeforeDisposedScanFinished).toBe(2);
        expect(statuses(editor)).toContainEqual(new FormReferenceStatusQuery(["Form_Reopened"]));
    });

    it("does not post a scan result after the editor was disposed", async () => {
        const { service, host, locator } = setup();
        const editor = host.openEditor("/work/process.bpmn");
        let finish: (value: unknown) => void = () => {};
        locator.findFormDeclarations.mockReturnValue(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );

        const request = service.requestStatus(editor.id);
        await Promise.resolve();
        service.disposeEditor(editor.id);
        finish({ kind: "matches", declarations: [], readFailures: [] });
        await request;

        expect(editor.posted).toEqual([]);
    });

    it("logs a watcher refresh failure without leaking a rejected promise", async () => {
        const { service, host, locator } = setup();
        await service.requestStatus(host.openEditor("/work/process.bpmn").id);
        const scanFailed = new Error("scan failed");
        locator.findFormDeclarations.mockRejectedValueOnce(scanFailed);

        await host.workspace.writeFile("/work/a.form", "{}");
        await vi.runAllTimersAsync();
        await vi.waitFor(() => expect(host.notifier.logged("error")).toEqual([scanFailed.stack]));
    });
});

describe("FormReferenceStatusService — folders", () => {
    it("forgets the forms of a folder deleted as one event", async () => {
        const { service, host, editor } = setupWithForms({
            "/work/forms/a.form": form("Form_A"),
            "/work/forms/sub/b.form": form("Form_B"),
            "/work/c.form": form("Form_C"),
        });
        await service.requestStatus(editor.id);

        await host.workspace.deleteDirectory("/work/forms");

        await vi.waitFor(() => expect(lastFormIds(editor)).toEqual(["Form_C"]));
    });

    it("lists the forms of a folder created as one event", async () => {
        const { service, host, editor } = setupWithForms({ "/work/c.form": form("Form_C") });
        await service.requestStatus(editor.id);

        host.workspace.createDirectory("/work/forms", {
            "/work/forms/sub/a.form": form("Form_A"),
        });

        await vi.waitFor(() => expect(lastFormIds(editor)).toEqual(["Form_A", "Form_C"]));
    });
});
