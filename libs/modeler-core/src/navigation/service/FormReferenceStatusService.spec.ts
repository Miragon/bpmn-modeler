import { beforeEach, describe, expect, it, vi } from "vitest";

import { FormReferenceStatusQuery } from "@miragon/bpmn-modeler-shared";

import { FormReferenceStatusService } from "./FormReferenceStatusService";

interface WatchHandlers {
    onChange?: (path: string) => void;
    onCreate?: (path: string) => void;
    onDelete?: (path: string) => void;
}

function setup() {
    const postMessage = vi.fn().mockResolvedValue(true);
    const getFilePath = vi.fn((editorId: string) => editorId.replace("file://", ""));
    const handlers: WatchHandlers[] = [];
    const watcherDisposes: ReturnType<typeof vi.fn>[] = [];
    const workspace = {
        findWorkspaceFolderForDocument: vi.fn(() => "/work"),
        getWorkspaceFolderPaths: vi.fn(() => ["/work"]),
        getDocumentDirectory: vi.fn(() => "/work"),
        createWatcher: vi.fn((_root: string, _glob: string, next: WatchHandlers) => {
            handlers.push(next);
            const dispose = vi.fn();
            watcherDisposes.push(dispose);
            return { dispose };
        }),
    };
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
    const notifier = { logWarning: vi.fn(), logError: vi.fn() };
    const service = new FormReferenceStatusService(
        { postMessage } as never,
        { getFilePath } as never,
        workspace as never,
        locator as never,
        notifier as never,
    );
    return { service, postMessage, handlers, watcherDisposes, workspace, locator, notifier };
}

beforeEach(() => vi.useFakeTimers());

describe("FormReferenceStatusService", () => {
    it("pushes a sorted, deduplicated form-id snapshot on request", async () => {
        const { service, postMessage, workspace } = setup();

        await service.requestStatus("file:///work/process.bpmn");

        expect(workspace.createWatcher).toHaveBeenCalledWith(
            "/work",
            "**/*.form",
            expect.any(Object),
        );
        expect(postMessage).toHaveBeenCalledWith(
            "file:///work/process.bpmn",
            new FormReferenceStatusQuery(["Form_A", "Form_B"]),
        );
    });

    it("refreshes on form changes and suppresses an unchanged watcher push", async () => {
        const { service, postMessage, handlers, locator } = setup();
        await service.requestStatus("file:///work/process.bpmn");

        handlers[0].onChange?.("/work/a.form");
        await vi.runAllTimersAsync();
        await vi.waitFor(() => expect(locator.findFormDeclarations).toHaveBeenCalledTimes(2));
        expect(postMessage).toHaveBeenCalledTimes(1);

        locator.findFormDeclarations.mockResolvedValue({
            kind: "matches",
            declarations: [{ id: "Form_C", path: "/work/c.form" }],
            readFailures: [],
        });
        handlers[0].onCreate?.("/work/c.form");
        await vi.runAllTimersAsync();
        await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
        expect(postMessage).toHaveBeenLastCalledWith(
            "file:///work/process.bpmn",
            new FormReferenceStatusQuery(["Form_C"]),
        );
    });

    it("shares one root watcher until the last editor closes", async () => {
        const { service, workspace, watcherDisposes } = setup();
        await service.requestStatus("file:///work/a.bpmn");
        await service.requestStatus("file:///work/b.bpmn");

        expect(workspace.createWatcher).toHaveBeenCalledTimes(1);
        service.disposeEditor("file:///work/a.bpmn");
        expect(watcherDisposes[0]).not.toHaveBeenCalled();
        service.disposeEditor("file:///work/b.bpmn");
        expect(watcherDisposes[0]).toHaveBeenCalledOnce();
    });

    it("shares one watcher refresh scan across editors with the same search scope", async () => {
        const { service, handlers, locator } = setup();
        await service.requestStatus("file:///work/a.bpmn");
        await service.requestStatus("file:///work/b.bpmn");

        handlers[0].onChange?.("/work/a.form");
        await vi.runAllTimersAsync();
        await vi.waitFor(() => expect(locator.findFormDeclarations).toHaveBeenCalledTimes(3));
    });

    it("does not refresh editors outside the changed loose-file root", async () => {
        const { service, handlers, locator, workspace } = setup();
        workspace.findWorkspaceFolderForDocument.mockReturnValue(undefined);
        workspace.getDocumentDirectory.mockImplementation((path: string) =>
            path.includes("/first/") ? "/first" : "/second",
        );
        await service.requestStatus("file:///first/a.bpmn");
        await service.requestStatus("file:///second/b.bpmn");

        handlers[0].onChange?.("/first/a.form");
        await vi.runAllTimersAsync();
        await vi.waitFor(() => expect(locator.findFormDeclarations).toHaveBeenCalledTimes(3));
    });

    it("does not reuse a scope scan that started before a watched change", async () => {
        const { service, handlers, locator, postMessage } = setup();
        const firstEditor = "file:///work/a.bpmn";
        const secondEditor = "file:///work/b.bpmn";
        await service.requestStatus(firstEditor);
        await service.requestStatus(secondEditor);
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

        const staleRequest = service.requestStatus(firstEditor);
        await vi.waitFor(() => expect(locator.findFormDeclarations).toHaveBeenCalledTimes(3));
        handlers[0].onChange?.("/work/fresh.form");
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
            expect(postMessage).toHaveBeenCalledWith(
                secondEditor,
                new FormReferenceStatusQuery(["Form_Fresh"]),
            ),
        );
        expect(callsAfterChange).toBe(4);
    });

    it("does not block a reopened editor on the disposed session's scan", async () => {
        const { service, locator, postMessage } = setup();
        const editorId = "file:///work/a.bpmn";
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

        const disposedRequest = service.requestStatus(editorId);
        await vi.waitFor(() => expect(locator.findFormDeclarations).toHaveBeenCalledOnce());
        service.disposeEditor(editorId);

        const reopenedRequest = service.requestStatus(editorId);
        for (let i = 0; i < 5; i++) await Promise.resolve();
        const callsBeforeDisposedScanFinished = locator.findFormDeclarations.mock.calls.length;

        finishDisposedScan({ kind: "matches", declarations: [], readFailures: [] });
        await Promise.all([disposedRequest, reopenedRequest]);

        expect(callsBeforeDisposedScanFinished).toBe(2);
        expect(postMessage).toHaveBeenCalledWith(
            editorId,
            new FormReferenceStatusQuery(["Form_Reopened"]),
        );
    });

    it("does not post a scan result after the editor was disposed", async () => {
        const { service, locator, postMessage } = setup();
        let finish: (value: unknown) => void = () => {};
        locator.findFormDeclarations.mockReturnValue(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );

        const request = service.requestStatus("file:///work/process.bpmn");
        await Promise.resolve();
        service.disposeEditor("file:///work/process.bpmn");
        finish({ kind: "matches", declarations: [], readFailures: [] });
        await request;

        expect(postMessage).not.toHaveBeenCalled();
    });

    it("logs a watcher refresh failure without leaking a rejected promise", async () => {
        const { service, handlers, locator, notifier } = setup();
        await service.requestStatus("file:///work/process.bpmn");
        const error = new Error("scan failed");
        locator.findFormDeclarations.mockRejectedValueOnce(error);

        handlers[0].onChange?.("/work/a.form");
        await vi.runAllTimersAsync();
        await vi.waitFor(() => expect(notifier.logError).toHaveBeenCalledWith(error));
    });
});
