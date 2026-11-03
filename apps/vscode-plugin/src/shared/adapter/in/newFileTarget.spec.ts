import { beforeEach, describe, expect, it, vi } from "vitest";

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

function uriOf(path: string) {
    return { path, with: (change: { path: string }) => uriOf(change.path) };
}

beforeEach(() => showSaveDialog.mockReset());

describe("promptNewFileTarget", () => {
    it("writes nothing when the dialog is cancelled", async () => {
        showSaveDialog.mockResolvedValue(undefined);

        expect(await promptNewFileTarget(OPTIONS)).toBeUndefined();
    });

    it("appends the extension a dialog left out", async () => {
        showSaveDialog.mockResolvedValue(uriOf("/work/send-mail"));

        expect((await promptNewFileTarget(OPTIONS))?.path).toBe("/work/send-mail.json");
    });

    it.each(["/work/send-mail.json", "/work/send-mail.JSON"])("keeps %s", async (path) => {
        showSaveDialog.mockResolvedValue(uriOf(path));

        expect((await promptNewFileTarget(OPTIONS))?.path).toBe(path);
    });
});
