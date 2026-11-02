import { beforeEach, describe, expect, it, vi } from "vitest";

const showSaveDialogMock = vi.fn();
const showTextDocumentMock = vi.fn();
const fsWriteFileMock = vi.fn();
const fsCreateDirectoryMock = vi.fn();
const workspaceState: { folders: readonly { uri: unknown }[] | undefined } = { folders: undefined };

function fakeUri(path: string): {
    scheme: string;
    path: string;
    with: (change: { path: string }) => ReturnType<typeof fakeUri>;
} {
    return { scheme: "file", path, with: (change) => fakeUri(change.path) };
}

vi.mock("vscode", () => ({
    commands: { registerCommand: vi.fn() },
    window: {
        showSaveDialog: (...args: unknown[]) => showSaveDialogMock(...args),
        showTextDocument: (...args: unknown[]) => showTextDocumentMock(...args),
    },
    workspace: {
        get workspaceFolders() {
            return workspaceState.folders;
        },
        fs: {
            writeFile: (...args: unknown[]) => fsWriteFileMock(...args),
            createDirectory: (...args: unknown[]) => fsCreateDirectoryMock(...args),
        },
    },
    Uri: {
        joinPath: (base: { path: string }, ...segments: string[]) =>
            fakeUri(`${base.path}/${segments.join("/")}`),
    },
}));

import { elementTemplateEnginePrompt, newElementTemplate } from "@miragon/bpmn-modeler-core";
import { createTestHost, PromptAnswers } from "@miragon/bpmn-modeler-core/testing";

import { NewElementTemplateController } from "./NewElementTemplateController";

function createController(promptAnswers: PromptAnswers = {}, configFolder = ".camunda") {
    const host = createTestHost({ promptAnswers, settings: { configFolder } });
    const controller = new NewElementTemplateController(host.picker, host.settings, host.notifier);
    return { controller, picker: host.picker, notifier: host.notifier };
}

function writtenText(): string {
    return (fsWriteFileMock.mock.calls[0][1] as Buffer).toString();
}

beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.folders = undefined;
});

describe("NewElementTemplateController.newElementTemplate", () => {
    it("writes the stub of the chosen engine, named after its file, and opens it", async () => {
        const { controller } = createController({ elementTemplateEngine: "c8" });
        const target = fakeUri("/work/.camunda/element-templates/send-mail.json");
        showSaveDialogMock.mockResolvedValue(target);

        await controller.newElementTemplate();

        expect(fsWriteFileMock).toHaveBeenCalledWith(target, expect.any(Buffer));
        expect(writtenText()).toBe(newElementTemplate("c8", "send-mail.json"));
        expect(showTextDocumentMock).toHaveBeenCalledWith(target);
    });

    it("asks for the engine only after the file is named", async () => {
        const { controller, picker } = createController({ elementTemplateEngine: "c7" });
        showSaveDialogMock.mockResolvedValue(fakeUri("/work/send-mail.json"));

        await controller.newElementTemplate();

        expect(picker.prompts).toEqual([
            { method: "choose", args: [elementTemplateEnginePrompt()] },
        ]);
        expect(writtenText()).toBe(newElementTemplate("c7", "send-mail.json"));
    });

    it("creates nothing when the save dialog is dismissed", async () => {
        const { controller, picker } = createController();
        showSaveDialogMock.mockResolvedValue(undefined);

        await controller.newElementTemplate();

        expect(picker.prompts).toEqual([]);
        expect(fsWriteFileMock).not.toHaveBeenCalled();
        expect(showTextDocumentMock).not.toHaveBeenCalled();
    });

    it("creates nothing when the engine pick is cancelled", async () => {
        const { controller } = createController();
        showSaveDialogMock.mockResolvedValue(fakeUri("/work/send-mail.json"));

        await expect(controller.newElementTemplate()).resolves.toBeUndefined();
        expect(fsWriteFileMock).not.toHaveBeenCalled();
        expect(showTextDocumentMock).not.toHaveBeenCalled();
    });

    it("suggests the template folder of the configured config folder", async () => {
        const { controller } = createController({}, "bpm");
        workspaceState.folders = [{ uri: fakeUri("/work") }];
        showSaveDialogMock.mockResolvedValue(undefined);

        await controller.newElementTemplate();

        expect(fsCreateDirectoryMock).toHaveBeenCalledWith(
            expect.objectContaining({ path: "/work/bpm/element-templates" }),
        );
        expect(showSaveDialogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                defaultUri: expect.objectContaining({
                    path: "/work/bpm/element-templates/new-element-template.json",
                }),
                filters: { "Element Template": ["json"] },
            }),
        );
    });

    it("suggests no folder and creates none without a workspace", async () => {
        const { controller } = createController();
        showSaveDialogMock.mockResolvedValue(undefined);

        await controller.newElementTemplate();

        expect(fsCreateDirectoryMock).not.toHaveBeenCalled();
        expect(showSaveDialogMock).toHaveBeenCalledWith(
            expect.objectContaining({ defaultUri: undefined }),
        );
    });

    it("appends the extension when the dialog returns a path without one", async () => {
        const { controller } = createController({ elementTemplateEngine: "c8" });
        showSaveDialogMock.mockResolvedValue(fakeUri("/work/send-mail"));

        await controller.newElementTemplate();

        expect(fsWriteFileMock.mock.calls[0][0]).toEqual(
            expect.objectContaining({ path: "/work/send-mail.json" }),
        );
        expect(writtenText()).toBe(newElementTemplate("c8", "send-mail.json"));
    });

    it("logs a failed write and lets VS Code report it", async () => {
        const { controller, notifier } = createController({ elementTemplateEngine: "c8" });
        showSaveDialogMock.mockResolvedValue(fakeUri("/work/send-mail.json"));
        const failure = new Error("read-only file system");
        fsWriteFileMock.mockRejectedValue(failure);

        await expect(controller.newElementTemplate()).rejects.toBe(failure);
        expect(notifier.loggedErrors).toEqual([failure]);
    });
});
