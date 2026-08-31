import { beforeEach, describe, expect, it, vi } from "vitest";

const executeCommandMock = vi.fn();
const registerUriHandlerMock = vi.fn(() => ({ dispose: vi.fn() }));

/** Enough of `vscode.Uri` to distinguish `Uri.file` from `Uri.parse` inputs. */
function fakeUri(path: string) {
    return {
        path,
        fsPath: path,
        toString: () => `file://${path}`,
    };
}

vi.mock("vscode", () => ({
    commands: { executeCommand: (...args: unknown[]) => executeCommandMock(...args) },
    window: { registerUriHandler: (...args: unknown[]) => registerUriHandlerMock(...args) },
    Uri: {
        file: (path: string) => fakeUri(path),
        parse: (value: string) => fakeUri(value.replace(/^file:\/\//, "")),
    },
}));

import { BPMN_VIEW_TYPE, DMN_VIEW_TYPE } from "@miragon/bpmn-modeler-core";
import { FocusElementQuery } from "@miragon/bpmn-modeler-shared";

import { DeepLinkController } from "./DeepLinkController";

function setup() {
    const postMessage = vi.fn().mockResolvedValue(true);
    const notifyError = vi.fn();
    const controller = new DeepLinkController({ postMessage } as never, { notifyError } as never);
    return { controller, postMessage, notifyError };
}

/** A `vscode.Uri` as VS Code hands it to a `UriHandler`. */
function link(path: string, query: string) {
    return { path, query, toString: () => `vscode://ext${path}?${query}` } as never;
}

beforeEach(() => {
    executeCommandMock.mockReset();
    executeCommandMock.mockResolvedValue(undefined);
});

describe("DeepLinkController", () => {
    it("opens a BPMN file in this extension's editor", async () => {
        const { controller } = setup();

        await controller.handleUri(link("/open", "file=/work/order.bpmn"));

        expect(executeCommandMock).toHaveBeenCalledWith(
            "vscode.openWith",
            expect.objectContaining({ path: "/work/order.bpmn" }),
            BPMN_VIEW_TYPE,
        );
    });

    it("opens a DMN file in the DMN editor", async () => {
        const { controller } = setup();

        await controller.handleUri(link("/open", "file=/work/rules.dmn"));

        expect(executeCommandMock).toHaveBeenCalledWith(
            "vscode.openWith",
            expect.anything(),
            DMN_VIEW_TYPE,
        );
    });

    it("focuses the element named by the link", async () => {
        const { controller, postMessage } = setup();

        await controller.handleUri(link("/open", "file=/work/order.bpmn&element=Task_Approve"));

        expect(postMessage).toHaveBeenCalledWith(
            "file:///work/order.bpmn",
            new FocusElementQuery("Task_Approve"),
        );
    });

    it("only opens the file when no element is named", async () => {
        const { controller, postMessage } = setup();

        await controller.handleUri(link("/open", "file=/work/order.bpmn"));

        expect(executeCommandMock).toHaveBeenCalledOnce();
        expect(postMessage).not.toHaveBeenCalled();
    });

    it("accepts a full file: URI as well as a bare path", async () => {
        const { controller } = setup();

        await controller.handleUri(link("/open", "file=file:///work/order.bpmn"));

        expect(executeCommandMock).toHaveBeenCalledWith(
            "vscode.openWith",
            expect.objectContaining({ path: "/work/order.bpmn" }),
            BPMN_VIEW_TYPE,
        );
    });

    it("matches the extension case-insensitively", async () => {
        const { controller } = setup();

        await controller.handleUri(link("/open", "file=/work/ORDER.BPMN"));

        expect(executeCommandMock).toHaveBeenCalledWith(
            "vscode.openWith",
            expect.anything(),
            BPMN_VIEW_TYPE,
        );
    });

    it("ignores a path it does not own rather than guessing", async () => {
        const { controller, notifyError } = setup();

        await controller.handleUri(link("/something-else", "file=/work/order.bpmn"));

        expect(executeCommandMock).not.toHaveBeenCalled();
        expect(notifyError).not.toHaveBeenCalled();
    });

    it("refuses a target that is not a diagram this extension owns", async () => {
        const { controller, notifyError } = setup();

        await controller.handleUri(link("/open", "file=/etc/passwd"));

        expect(executeCommandMock).not.toHaveBeenCalled();
        expect(notifyError).toHaveBeenCalledOnce();
    });

    it("reports a link with no file parameter", async () => {
        const { controller, notifyError } = setup();

        await controller.handleUri(link("/open", "element=Task_Approve"));

        expect(executeCommandMock).not.toHaveBeenCalled();
        expect(notifyError).toHaveBeenCalledOnce();
    });

    it("reports a failure to open instead of throwing at VS Code", async () => {
        const { controller, notifyError } = setup();
        executeCommandMock.mockRejectedValue(new Error("no such file"));

        await controller.handleUri(link("/open", "file=/work/order.bpmn"));

        expect(notifyError).toHaveBeenCalledOnce();
    });

    it("registers itself as the extension's URI handler", () => {
        const { controller } = setup();
        const subscriptions: unknown[] = [];

        controller.register({ subscriptions } as never);

        expect(registerUriHandlerMock).toHaveBeenCalledWith(controller);
        expect(subscriptions).toHaveLength(1);
    });
});
