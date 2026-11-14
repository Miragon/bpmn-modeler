import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({
    importXML: vi.fn(async () => undefined),
    setMarks: vi.fn(),
    openView: vi.fn(async () => true),
    getActiveElementId: vi.fn(() => null),
    onViewChanged: vi.fn(() => () => undefined),
    focus: vi.fn(),
    reveal: vi.fn(),
    getViewport: vi.fn(),
    setViewport: vi.fn(),
    onViewportChanged: vi.fn(() => () => undefined),
    getTableScroll: vi.fn(),
    setTableScroll: vi.fn(),
    onTableScroll: vi.fn(() => () => undefined),
    setTheme: vi.fn(),
    setLocale: vi.fn(async () => undefined),
    destroy: vi.fn(),
}));
const createDiffViewer = vi.hoisted(() => vi.fn(() => viewer));

vi.mock("@miragon/dmn-modeler", () => ({ createDiffViewer }));

import type { DmnDiffPaneHost } from "../port/dmnHost";
import { bootstrapDiffPane } from "./diffBootstrap";

let posted: Array<{ type: string }>;
const host = {
    postMessage: (message: unknown) => posted.push(message as never),
    getState: () => undefined,
    setState: () => undefined,
    updateState: () => undefined,
} as DmnDiffPaneHost;

beforeEach(() => {
    posted = [];
    document.body.innerHTML = '<div id="app"></div>';
});

afterEach(() => {
    document.body.innerHTML = "";
    document.body.className = "";
    document.documentElement.removeAttribute("data-dmn-theme");
    vi.clearAllMocks();
});

describe("bootstrapDiffPane", () => {
    it("stands up a read-only viewer in the canvas and asks the host for the file", () => {
        bootstrapDiffPane(host);

        expect(createDiffViewer).toHaveBeenCalledWith(document.getElementById("js-canvas"), {
            theme: "light",
            topInset: 72,
        });
        expect(document.body.classList).toContain("dmn-diff-page");
        expect(posted.map((message) => message.type)).toEqual(["GetDmnFileCommand"]);
    });

    it("follows the IDE's theme", async () => {
        bootstrapDiffPane(host);

        document.body.classList.add("vscode-dark");
        await vi.waitFor(() => expect(viewer.setTheme).toHaveBeenCalledWith("dark"));
        expect(document.documentElement.getAttribute("data-dmn-theme")).toBe("dark");
    });

    it("forwards uncaught errors to the host log", async () => {
        const stop = bootstrapDiffPane(host);

        window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));

        await vi.waitFor(() =>
            expect(posted).toContainEqual(
                expect.objectContaining({
                    type: "LogErrorCommand",
                    message: "Unhandled error: boom",
                }),
            ),
        );
        stop();
    });

    it("destroys the viewer when stopped", () => {
        const stop = bootstrapDiffPane(host);

        stop();

        expect(viewer.destroy).toHaveBeenCalledOnce();
        expect(document.querySelector(".diff-legend")).toBeNull();
    });

    it("refuses a page without its root", () => {
        document.body.innerHTML = "";

        expect(() => bootstrapDiffPane(host)).toThrow("Missing required DMN diff element <#app>");
    });
});
