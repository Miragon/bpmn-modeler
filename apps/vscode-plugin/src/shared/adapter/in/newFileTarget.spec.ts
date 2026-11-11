import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Uri } from "vscode";

const showSaveDialog = vi.fn();

vi.mock("vscode", () => ({
    Uri: {},
    window: { showSaveDialog: (...args: unknown[]) => showSaveDialog(...args) },
}));

import { promptNewFileTarget } from "./newFileTarget";

const OPTIONS = {
    title: "New Element Template",
    filterLabel: "Element Template",
    extension: "json",
    defaultUri: undefined,
};

function uriOf(path: string): Uri {
    return {
        scheme: "file",
        authority: "",
        path,
        query: "",
        fragment: "",
        fsPath: path,
        with: (change) => uriOf(change.path ?? path),
        toString: () => `file://${path}`,
        toJSON: () => ({ scheme: "file", path }),
    };
}

beforeEach(() => showSaveDialog.mockReset());

describe("promptNewFileTarget", () => {
    it("forwards the supplied native dialog contents without changing the default URI", async () => {
        const defaultUri = uriOf("/work/custom.json");
        showSaveDialog.mockResolvedValue(undefined);
        await promptNewFileTarget({ ...OPTIONS, defaultUri });
        expect(showSaveDialog).toHaveBeenCalledExactlyOnceWith({
            title: "New Element Template",
            filters: { "Element Template": ["json"] },
            defaultUri,
        });
        expect(showSaveDialog.mock.calls[0][0].defaultUri).toBe(defaultUri);
    });
    it("writes nothing when the dialog is cancelled", async () => {
        showSaveDialog.mockResolvedValue(undefined);

        expect(await promptNewFileTarget(OPTIONS)).toBeUndefined();
    });

    it("appends the extension a dialog left out", async () => {
        showSaveDialog.mockResolvedValue(uriOf("/work/send-mail"));

        expect((await promptNewFileTarget(OPTIONS))?.path).toBe("/work/send-mail.json");
    });

    it.each(["/work/send-mail.json", "/work/send-mail.JSON"])("keeps %s", async (path) => {
        const target = uriOf(path);
        showSaveDialog.mockResolvedValue(target);

        expect(await promptNewFileTarget(OPTIONS)).toBe(target);
    });
});
