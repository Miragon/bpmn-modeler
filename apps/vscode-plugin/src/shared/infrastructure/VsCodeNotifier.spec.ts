import { beforeEach, describe, expect, it, vi } from "vitest";

const executeCommandMock = vi.fn();

vi.mock("vscode", () => ({
    commands: {
        executeCommand: (...args: unknown[]) => executeCommandMock(...args),
    },
    window: {
        createOutputChannel: () => ({
            clear: vi.fn(),
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            show: vi.fn(),
        }),
    },
    Uri: { file: (path: string) => ({ scheme: "file", path, fsPath: path }) },
}));

import { VsCodeNotifier } from "./VsCodeNotifier";

beforeEach(() => {
    executeCommandMock.mockReset();
});

describe("VsCodeNotifier.openDocument", () => {
    it("opens the file as a persistent tab via `preview: false`", async () => {
        const sut = new VsCodeNotifier();

        await sut.openDocument("/repo/src/Worker.java");

        expect(executeCommandMock).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ scheme: "file", path: "/repo/src/Worker.java" }),
            { preview: false },
        );
    });
});
