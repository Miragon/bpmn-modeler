import { beforeEach, describe, expect, it, vi } from "vitest";

import packageJson from "../package.json";

const mocks = vi.hoisted(() => {
    const editor = {
        importSchema: vi.fn().mockResolvedValue({ warnings: [] }),
        saveSchema: vi.fn(() => ({})),
        on: vi.fn(),
    };
    const viewer = {
        importSchema: vi.fn().mockResolvedValue({ warnings: [] }),
        on: vi.fn(),
        _getSubmitData: vi.fn(() => ({})),
    };

    return {
        dedicatedEditor: vi.fn(function () {
            return editor;
        }),
        dedicatedViewer: vi.fn(function () {
            return viewer;
        }),
        aggregateEditor: vi.fn(function () {
            return editor;
        }),
        aggregateViewer: vi.fn(function () {
            return viewer;
        }),
        host: {
            getState: vi.fn(() => ({ mode: "edit" as const })),
            setState: vi.fn(),
            updateState: vi.fn(),
            postMessage: vi.fn(),
        },
    };
});

vi.mock("@bpmn-io/form-js-editor", () => ({ FormEditor: mocks.dedicatedEditor }));
vi.mock("@bpmn-io/form-js-viewer", () => ({ Form: mocks.dedicatedViewer }));
vi.mock("@bpmn-io/form-js", () => ({
    FormEditor: mocks.aggregateEditor,
    Form: mocks.aggregateViewer,
}));
vi.mock("./app/host", () => ({ getHostApi: () => mocks.host }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
});

describe("form webview bootstrap", () => {
    it("declares the editor and viewer packages directly", () => {
        const editorVersion = packageJson.dependencies["@bpmn-io/form-js-editor"];
        const viewerVersion = packageJson.dependencies["@bpmn-io/form-js-viewer"];

        expect(editorVersion).toBeDefined();
        expect(viewerVersion).toBe(editorVersion);
        expect(packageJson.dependencies).not.toHaveProperty("@bpmn-io/form-js");
    });

    it("creates the visual editor and preview from their dedicated packages", async () => {
        await import("./main");
        window.dispatchEvent(new Event("DOMContentLoaded"));

        expect(mocks.dedicatedEditor).toHaveBeenCalledWith({
            container: document.getElementById("form-editor"),
        });
        expect(mocks.dedicatedViewer).toHaveBeenCalledWith({
            container: document.getElementById("form-preview"),
        });
        expect(mocks.aggregateEditor).not.toHaveBeenCalled();
        expect(mocks.aggregateViewer).not.toHaveBeenCalled();
    });

    it("requests the current ephemeral form input values", async () => {
        await import("./main");
        window.dispatchEvent(new Event("DOMContentLoaded"));

        expect(mocks.host.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: "GetFormInputValuesCommand" }),
        );
    });
});
