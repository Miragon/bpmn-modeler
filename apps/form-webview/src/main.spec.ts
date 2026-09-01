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
        expect(packageJson.dependencies).toMatchObject({
            "@bpmn-io/form-js-editor": "1.25.0",
            "@bpmn-io/form-js-viewer": "1.25.0",
        });
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
});
