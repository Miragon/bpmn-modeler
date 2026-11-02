import { describe, expect, it, vi } from "vitest";

import {
    type Command,
    isMessageOfType,
    type MessageOfType,
    type ProtocolMessageType,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import type { SurfaceHandle } from "../surface";
import type { CanvasViewState } from "../webviewState";
import { createSurfaceDocument } from "./surfaceDocument";

const imported = { warnings: [] as unknown[] };

function modelerSurface() {
    return {
        setMode: vi.fn(),
        newDiagram: vi.fn(async () => imported),
        loadDiagram: vi.fn(async (_xml: string) => imported),
        exportDiagram: vi.fn(async () => "<exported />"),
        alignElementsToOrigin: vi.fn(),
        hasPendingInput: vi.fn(() => false),
        flushPendingInput: vi.fn(),
        viewport: { centerOnElement: vi.fn() },
    };
}

function designerSurface() {
    return {
        newDiagram: vi.fn(async () => imported),
        loadDiagram: vi.fn(async (_xml: string) => imported),
        exportDiagram: vi.fn(async () => "<designed />"),
        hasPendingInput: vi.fn(() => false),
        flushPendingInput: vi.fn(),
        viewport: { centerOnElement: vi.fn() },
    };
}

function viewerSurface() {
    return {
        loadDiagram: vi.fn(async (_xml: string) => imported),
        exportDiagram: vi.fn(async () => "<viewed />"),
        viewport: { centerOnElement: vi.fn() },
    };
}

const viewSnapshot: CanvasViewState = {
    rootElementId: "SubProcess_1_plane",
    viewport: { x: 40, y: 20, width: 800, height: 600, scale: 1.5 },
    selectedElementIds: ["Task_1"],
};

function surfaceDocumentOn(initialSurface: object) {
    const posted: (Command | Query)[] = [];
    const viewState = { captureViewState: vi.fn(() => viewSnapshot), applyViewState: vi.fn() };
    let surface = initialSurface;
    let boundViewState: typeof viewState | undefined = viewState;
    const surfaceDocument = createSurfaceDocument(
        { postMessage: (message) => posted.push(message) },
        {
            getSurface: () => surface as unknown as SurfaceHandle,
            getViewState: () => boundViewState,
        },
    );
    return {
        surfaceDocument,
        posted,
        viewState,
        replaceSurface: (next: object) => {
            surface = next;
        },
        unbindViewState: () => {
            boundViewState = undefined;
        },
    };
}

const postedOfType = <TType extends ProtocolMessageType>(
    posted: (Command | Query)[],
    type: TType,
) => posted.filter((message): message is MessageOfType<TType> => isMessageOfType(message, type));

const callOrder = (fn: { mock: { invocationCallOrder: number[] } }, call = 0) =>
    fn.mock.invocationCallOrder[call];

describe("createSurfaceDocument", () => {
    describe("host document import", () => {
        it("loads the host XML into the surface", async () => {
            const surface = modelerSurface();
            const { surfaceDocument } = surfaceDocumentOn(surface);

            await surfaceDocument.importDocument("<definitions />");

            expect(surface.loadDiagram).toHaveBeenCalledExactlyOnceWith("<definitions />");
            expect(surface.newDiagram).not.toHaveBeenCalled();
        });

        it.each([
            ["empty", ""],
            ["missing", undefined],
        ])(
            "starts a blank diagram for %s content on an editable surface",
            async (_case, content) => {
                const surface = designerSurface();
                const { surfaceDocument } = surfaceDocumentOn(surface);

                await surfaceDocument.importDocument(content);

                expect(surface.newDiagram).toHaveBeenCalledOnce();
                expect(surface.loadDiagram).not.toHaveBeenCalled();
            },
        );

        it("hands missing content to the readonly viewer as empty XML", async () => {
            const surface = viewerSurface();
            const { surfaceDocument } = surfaceDocumentOn(surface);

            await surfaceDocument.importDocument(undefined);

            expect(surface.loadDiagram).toHaveBeenCalledExactlyOnceWith("");
        });

        it("logs the import warnings to the host", async () => {
            const surface = modelerSurface();
            surface.loadDiagram.mockResolvedValueOnce({
                warnings: [new Error("unknown attribute")],
            });
            const { surfaceDocument, posted } = surfaceDocumentOn(surface);

            await surfaceDocument.importDocument("<definitions />");

            expect(postedOfType(posted, "LogWarningCommand")).toEqual([
                expect.objectContaining({
                    message: expect.stringMatching(
                        /^Diagram opened with following warnings: [\s\S]*unknown attribute/,
                    ),
                }),
            ]);
        });

        it("logs nothing for a clean import", async () => {
            const { surfaceDocument, posted } = surfaceDocumentOn(modelerSurface());

            await surfaceDocument.importDocument("<definitions />");

            expect(posted).toEqual([]);
        });

        it("restores the view captured before the import once it finished", async () => {
            const surface = modelerSurface();
            const { surfaceDocument, viewState } = surfaceDocumentOn(surface);

            await surfaceDocument.importDocument("<definitions />");

            expect(viewState.applyViewState).toHaveBeenCalledExactlyOnceWith(viewSnapshot);
            expect(callOrder(viewState.captureViewState)).toBeLessThan(
                callOrder(surface.loadDiagram),
            );
            expect(callOrder(surface.loadDiagram)).toBeLessThan(
                callOrder(viewState.applyViewState),
            );
        });

        it("restores the view even when the import fails", async () => {
            const surface = modelerSurface();
            surface.loadDiagram.mockRejectedValueOnce(new Error("not BPMN"));
            const { surfaceDocument, viewState } = surfaceDocumentOn(surface);

            await expect(surfaceDocument.importDocument("<broken />")).rejects.toThrow("not BPMN");

            expect(viewState.applyViewState).toHaveBeenCalledExactlyOnceWith(viewSnapshot);
        });

        it("keeps no view state before the surface is bound", async () => {
            const surface = modelerSurface();
            const { surfaceDocument, viewState, unbindViewState } = surfaceDocumentOn(surface);
            unbindViewState();

            await surfaceDocument.importDocument("<definitions />");

            expect(surface.loadDiagram).toHaveBeenCalledOnce();
            expect(viewState.captureViewState).not.toHaveBeenCalled();
            expect(viewState.applyViewState).not.toHaveBeenCalled();
        });
    });

    describe("export and sync", () => {
        it("exports from the surface that is live at the time", async () => {
            const { surfaceDocument, replaceSurface } = surfaceDocumentOn(modelerSurface());
            replaceSurface(designerSurface());

            await expect(surfaceDocument.exportDocument()).resolves.toBe("<designed />");
        });

        it("aligns the modeler to the origin after a sync", () => {
            const surface = modelerSurface();
            const { surfaceDocument } = surfaceDocumentOn(surface);

            surfaceDocument.afterSync();

            expect(surface.alignElementsToOrigin).toHaveBeenCalledOnce();
        });

        it.each([
            ["designer", designerSurface],
            ["viewer", viewerSurface],
        ])("leaves the %s unaligned after a sync", (_case, makeSurface) => {
            const surface = { ...makeSurface(), alignElementsToOrigin: vi.fn() };
            const { surfaceDocument } = surfaceDocumentOn(surface);

            surfaceDocument.afterSync();

            expect(surface.alignElementsToOrigin).not.toHaveBeenCalled();
        });
    });

    describe("pending panel input", () => {
        it.each([
            ["modeler", modelerSurface],
            ["designer", designerSurface],
        ])("reports the %s's pending panel input", (_case, makeSurface) => {
            const surface = makeSurface();
            surface.hasPendingInput.mockReturnValue(true);
            const { surfaceDocument } = surfaceDocumentOn(surface);

            expect(surfaceDocument.hasPendingInput()).toBe(true);
        });

        it("flushes the panel input of the surface that is live at the time", () => {
            const modeler = modelerSurface();
            const designer = designerSurface();
            const { surfaceDocument, replaceSurface } = surfaceDocumentOn(modeler);
            replaceSurface(designer);

            surfaceDocument.flushPendingInput();

            expect(designer.flushPendingInput).toHaveBeenCalledOnce();
            expect(modeler.flushPendingInput).not.toHaveBeenCalled();
        });

        it("finds no panel input on the readonly viewer", () => {
            const { surfaceDocument } = surfaceDocumentOn(viewerSurface());

            expect(surfaceDocument.hasPendingInput()).toBe(false);
            expect(() => surfaceDocument.flushPendingInput()).not.toThrow();
        });
    });

    describe("diagram refresh", () => {
        it("re-imports the exported XML and restores the view around it", async () => {
            const surface = modelerSurface();
            const { surfaceDocument, viewState } = surfaceDocumentOn(surface);

            await surfaceDocument.refreshDiagram();

            expect(surface.loadDiagram).toHaveBeenCalledExactlyOnceWith("<exported />");
            expect(viewState.applyViewState).toHaveBeenCalledExactlyOnceWith(viewSnapshot);
            expect(callOrder(surface.exportDiagram)).toBeLessThan(
                callOrder(viewState.captureViewState),
            );
            expect(callOrder(viewState.captureViewState)).toBeLessThan(
                callOrder(surface.loadDiagram),
            );
            expect(callOrder(surface.loadDiagram)).toBeLessThan(
                callOrder(viewState.applyViewState),
            );
        });

        it("restores the view even when the re-import fails", async () => {
            const surface = modelerSurface();
            surface.loadDiagram.mockRejectedValueOnce(new Error("broken refresh"));
            const { surfaceDocument, viewState } = surfaceDocumentOn(surface);

            await expect(surfaceDocument.refreshDiagram()).rejects.toThrow("broken refresh");

            expect(viewState.applyViewState).toHaveBeenCalledExactlyOnceWith(viewSnapshot);
        });
    });

    it("centres the element on the live surface's viewport", () => {
        const surface = modelerSurface();
        const { surfaceDocument } = surfaceDocumentOn(surface);

        surfaceDocument.centerOnElement("Task_1");

        expect(surface.viewport.centerOnElement).toHaveBeenCalledExactlyOnceWith("Task_1");
    });
});
