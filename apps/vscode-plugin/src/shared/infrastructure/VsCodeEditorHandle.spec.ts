import { beforeEach, describe, expect, it, vi } from "vitest";

const applyEditMock = vi.fn();

// `workspace.fs.isWritableFileSystem` decides whether a non-`file:` document may
// be edited: `true` for a writable provider, `false` for a read-only one,
// `undefined` when VS Code knows no provider for the scheme.
const isWritableFileSystemMock = vi.fn<(scheme: string) => boolean | undefined>();

// `WorkspaceEdit.replace` is the only method the subject calls; capturing the
// args lets us assert the edit targets the full document range.
const replaceMock = vi.fn();

vi.mock("vscode", () => ({
    workspace: {
        applyEdit: (...args: unknown[]) => applyEditMock(...args),
        fs: { isWritableFileSystem: (scheme: string) => isWritableFileSystemMock(scheme) },
        onDidChangeTextDocument: vi.fn(),
        onDidChangeConfiguration: vi.fn(),
    },
    WorkspaceEdit: class {
        replace = replaceMock;
    },
    // Constructor stub records the range corners so the spec can verify the
    // edit spans line 0 through the document's last line.
    Range: class {
        constructor(
            readonly startLine: number,
            readonly startChar: number,
            readonly endLine: number,
            readonly endChar: number,
        ) {}
    },
}));

// `create` delegates HTML bootstrapping to this module and stores whatever
// panel it returns; returning the fake panel lets us drive panel state.
let nextPanel: unknown;
vi.mock("./bootstrapWebview", () => ({
    bootstrapWebview: vi.fn(() => nextPanel),
}));

import { bootstrapWebview } from "./bootstrapWebview";
import { VsCodeEditorHandle } from "./VsCodeEditorHandle";

interface FakePanel {
    options: { retainContextWhenHidden: boolean };
    visible: boolean;
    active: boolean;
    webview: { postMessage: ReturnType<typeof vi.fn> };
}

function makePanel(overrides: Partial<FakePanel> = {}): FakePanel {
    return {
        options: { retainContextWhenHidden: false },
        visible: true,
        active: false,
        webview: { postMessage: vi.fn().mockResolvedValue(true) },
        ...overrides,
    };
}

interface FakeDocument {
    uri: { scheme: string; path: string; fsPath: string; toString: () => string };
    getText: () => string;
    lineCount: number;
    save: ReturnType<typeof vi.fn>;
}

function makeDocument(overrides: Partial<FakeDocument> = {}): FakeDocument {
    const scheme = overrides.uri?.scheme ?? "file";
    return {
        uri: {
            scheme,
            path: "/a.bpmn",
            fsPath: "/a.bpmn",
            toString: () => `${scheme}:/a.bpmn`,
        },
        getText: () => "<old/>",
        lineCount: 3,
        save: vi.fn().mockResolvedValue(true),
        ...overrides,
    };
}

/**
 * Builds a handle via the real `create` factory while injecting the fake panel
 * the mocked `bootstrapWebview` hands back. Casting to `never` only at the
 * `create` boundary keeps the doubles' inferred types available to assertions.
 */
function createHandle(panel: FakePanel, document: FakeDocument): VsCodeEditorHandle {
    nextPanel = panel;
    return VsCodeEditorHandle.create("bpmn", "editor-1", panel as never, document as never);
}

beforeEach(() => {
    vi.clearAllMocks();
});

function makeSchemeDocument(scheme: string, overrides: Partial<FakeDocument> = {}): FakeDocument {
    return makeDocument({
        uri: { scheme, path: "/a.bpmn", fsPath: "/a.bpmn", toString: () => `${scheme}:/a.bpmn` },
        ...overrides,
    });
}

describe("VsCodeEditorHandle.writeContent", () => {
    it("throws for a read-only file system (git:) without issuing an edit", async () => {
        isWritableFileSystemMock.mockReturnValue(false);
        const handle = createHandle(makePanel(), makeSchemeDocument("git"));

        await expect(handle.writeContent("<new/>")).rejects.toThrow(/git/);
        expect(isWritableFileSystemMock).toHaveBeenCalledWith("git");
        expect(applyEditMock).not.toHaveBeenCalled();
    });

    it("throws for a scheme VS Code knows no file system for (untitled:)", async () => {
        isWritableFileSystemMock.mockReturnValue(undefined);
        const handle = createHandle(makePanel(), makeSchemeDocument("untitled"));

        await expect(handle.writeContent("<new/>")).rejects.toThrow(/untitled/);
        expect(applyEditMock).not.toHaveBeenCalled();
    });

    it("applies an edit to a document on a writable custom file system (a collaborative provider)", async () => {
        isWritableFileSystemMock.mockReturnValue(true);
        applyEditMock.mockResolvedValue(true);
        const document = makeSchemeDocument("bpm-live", { getText: () => "<old/>", lineCount: 3 });
        const handle = createHandle(makePanel(), document);

        const result = await handle.writeContent("<new/>");

        expect(result).toBe(true);
        expect(isWritableFileSystemMock).toHaveBeenCalledWith("bpm-live");
        expect(replaceMock).toHaveBeenCalledWith(
            document.uri,
            expect.objectContaining({ startLine: 0, startChar: 0, endLine: 3, endChar: 0 }),
            "<new/>",
        );
    });

    it("never consults the file-system registry for a file: document", async () => {
        applyEditMock.mockResolvedValue(true);
        const handle = createHandle(makePanel(), makeDocument());

        await handle.writeContent("<new/>");

        expect(isWritableFileSystemMock).not.toHaveBeenCalled();
    });

    it("returns false without an edit when content is unchanged", async () => {
        const document = makeDocument({ getText: () => "<same/>" });
        const handle = createHandle(makePanel(), document);

        const result = await handle.writeContent("<same/>");

        expect(result).toBe(false);
        expect(applyEditMock).not.toHaveBeenCalled();
    });

    it("applies an edit over the full document range and returns the applyEdit result", async () => {
        applyEditMock.mockResolvedValue(true);
        const document = makeDocument({ getText: () => "<old/>", lineCount: 3 });
        const handle = createHandle(makePanel(), document);

        const result = await handle.writeContent("<new/>");

        expect(result).toBe(true);
        expect(applyEditMock).toHaveBeenCalledTimes(1);
        expect(replaceMock).toHaveBeenCalledWith(
            document.uri,
            expect.objectContaining({ startLine: 0, startChar: 0, endLine: 3, endChar: 0 }),
            "<new/>",
        );
    });
});

describe("VsCodeEditorHandle.save", () => {
    it("throws for a scheme without a writable file system (untitled:)", async () => {
        isWritableFileSystemMock.mockReturnValue(undefined);
        const document = makeSchemeDocument("untitled");
        const handle = createHandle(makePanel(), document);

        await expect(handle.save()).rejects.toThrow(/untitled/);
        expect(document.save).not.toHaveBeenCalled();
    });

    it("delegates to document.save on a writable custom file system", async () => {
        isWritableFileSystemMock.mockReturnValue(true);
        const document = makeSchemeDocument("bpm-live");
        const handle = createHandle(makePanel(), document);

        expect(await handle.save()).toBe(true);
        expect(document.save).toHaveBeenCalledTimes(1);
    });

    it("delegates to document.save for a file scheme", async () => {
        const document = makeDocument();
        const handle = createHandle(makePanel(), document);

        const result = await handle.save();

        expect(result).toBe(true);
        expect(document.save).toHaveBeenCalledTimes(1);
    });
});

describe("VsCodeEditorHandle.reload", () => {
    it("re-bootstraps the same panel with the session's viewType and visibility", () => {
        const panel = makePanel();
        // Session opened with viewType "bpmn" and the default visibility (true);
        // reload must rebuild the exact same HTML in place.
        const handle = createHandle(panel, makeDocument());
        vi.mocked(bootstrapWebview).mockClear();

        handle.reload();

        expect(bootstrapWebview).toHaveBeenCalledWith("bpmn", panel, true);
    });
});

describe("VsCodeEditorHandle.postMessage", () => {
    const message = { type: "x" } as never;

    it("throws the exact hidden-editor message when hidden and not retained", async () => {
        const panel = makePanel({ options: { retainContextWhenHidden: false }, visible: false });
        const handle = createHandle(panel, makeDocument());

        // Replay logic downstream string-matches this exact text; keep verbatim.
        await expect(handle.postMessage(message)).rejects.toThrow("The active editor is hidden.");
        expect(panel.webview.postMessage).not.toHaveBeenCalled();
    });

    it("posts when hidden but context is retained", async () => {
        const panel = makePanel({ options: { retainContextWhenHidden: true }, visible: false });
        const handle = createHandle(panel, makeDocument());

        const result = await handle.postMessage(message);

        expect(result).toBe(true);
        expect(panel.webview.postMessage).toHaveBeenCalledWith(message);
    });

    it("throws the webview-failure message when postMessage returns false", async () => {
        const panel = makePanel();
        panel.webview.postMessage.mockResolvedValue(false);
        const handle = createHandle(panel, makeDocument());

        await expect(handle.postMessage(message)).rejects.toThrow(
            "Failed to send message to the webview.",
        );
    });
});
