import { beforeEach, describe, expect, it, vi } from "vitest";

const executeCommandMock = vi.fn();
const onDidChangeTabsMock = vi.fn();
const openTextDocumentMock = vi.fn();
const showTextDocumentMock = vi.fn();
const closeTabMock = vi.fn();

let openTabGroups: { tabs: { input: unknown }[] }[] = [];

vi.mock("vscode", () => {
    class TabInputText {
        constructor(readonly uri: { path: string }) {}
    }

    const fileUri = (path: string) => ({
        scheme: "file",
        path,
        fsPath: path,
        toString: () => `file://${path}`,
    });

    return {
        commands: {
            executeCommand: (...args: unknown[]) => executeCommandMock(...args),
        },
        TabInputText,
        Uri: { file: fileUri },
        ViewColumn: { Beside: -2 },
        window: {
            showTextDocument: (...args: unknown[]) => showTextDocumentMock(...args),
            tabGroups: {
                get all() {
                    return openTabGroups;
                },
                close: (...args: unknown[]) => closeTabMock(...args),
                onDidChangeTabs: (...args: unknown[]) => onDidChangeTabsMock(...args),
            },
        },
        workspace: {
            openTextDocument: (...args: unknown[]) => openTextDocumentMock(...args),
        },
    };
});

import { TabInputText, Uri, ViewColumn } from "vscode";

import { setContext } from "./extensionContext";
import { VsCodeTextEditor } from "./VsCodeTextEditor";

const DOCUMENT_PATH = "/workspace/process.bpmn";

describe("VsCodeTextEditor", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        openTabGroups = [];
        onDidChangeTabsMock.mockReturnValue({ dispose: vi.fn() });
        setContext({ subscriptions: [] } as never);
    });

    it("opens the standard text editor beside the modeler", async () => {
        const textDocument = { uri: Uri.file(DOCUMENT_PATH) };
        openTextDocumentMock.mockResolvedValue(textDocument);
        showTextDocumentMock.mockResolvedValue(undefined);
        executeCommandMock.mockResolvedValue(undefined);
        const textEditor = new VsCodeTextEditor();

        await expect(textEditor.toggle(DOCUMENT_PATH)).resolves.toBe(true);

        expect(openTextDocumentMock).toHaveBeenCalledWith(DOCUMENT_PATH);
        expect(executeCommandMock).toHaveBeenCalledWith(
            "vscode.openWith",
            textDocument.uri,
            "default",
            ViewColumn.Beside,
        );
    });

    it("keeps the text editor open when the tab remains after a close attempt", async () => {
        const textDocument = { uri: Uri.file(DOCUMENT_PATH) };
        openTextDocumentMock.mockResolvedValue(textDocument);
        showTextDocumentMock.mockResolvedValue(undefined);
        executeCommandMock.mockResolvedValue(undefined);
        closeTabMock.mockResolvedValue(true);
        const textEditor = new VsCodeTextEditor();

        await textEditor.toggle(DOCUMENT_PATH);
        openTabGroups = [{ tabs: [{ input: new TabInputText(textDocument.uri) }] }];

        await expect(textEditor.toggle(DOCUMENT_PATH)).resolves.toBe(true);
        expect(closeTabMock).toHaveBeenCalledOnce();
    });

    it("reports the text editor as closed when its tab disappears", async () => {
        const textDocument = { uri: Uri.file(DOCUMENT_PATH) };
        openTextDocumentMock.mockResolvedValue(textDocument);
        showTextDocumentMock.mockResolvedValue(undefined);
        executeCommandMock.mockResolvedValue(undefined);
        closeTabMock.mockImplementation(async () => {
            openTabGroups = [];
            return true;
        });
        const textEditor = new VsCodeTextEditor();

        await textEditor.toggle(DOCUMENT_PATH);
        openTabGroups = [{ tabs: [{ input: new TabInputText(textDocument.uri) }] }];

        await expect(textEditor.toggle(DOCUMENT_PATH)).resolves.toBe(false);
    });

    it("ignores another text tab for the same file after the targeted tab closes", async () => {
        const textDocument = { uri: Uri.file(DOCUMENT_PATH) };
        const targetedTab = { input: new TabInputText(textDocument.uri) };
        const otherTab = { input: new TabInputText(textDocument.uri) };
        openTextDocumentMock.mockResolvedValue(textDocument);
        showTextDocumentMock.mockResolvedValue(undefined);
        executeCommandMock.mockResolvedValue(undefined);
        closeTabMock.mockImplementation(async () => {
            openTabGroups = [{ tabs: [otherTab] }];
            return true;
        });
        const textEditor = new VsCodeTextEditor();

        await textEditor.toggle(DOCUMENT_PATH);
        openTabGroups = [{ tabs: [targetedTab, otherTab] }];

        await expect(textEditor.toggle(DOCUMENT_PATH)).resolves.toBe(false);
        expect(closeTabMock).toHaveBeenCalledWith(targetedTab);
    });
});
