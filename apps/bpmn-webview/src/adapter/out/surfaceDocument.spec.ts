import { describe, expect, it, vi } from "vitest";

import {
    type Command,
    isMessageOfType,
    type MessageOfType,
    type ProtocolMessageType,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import type { SurfaceHandle } from "../../domain/surface";
import { createSurfaceDocument } from "./surfaceDocument";

const imported = { warnings: [] as unknown[] };

function modelerSurface() {
    return {
        setMode: vi.fn(),
        newDiagram: vi.fn(async () => imported),
        reloadDiagram: vi.fn(async (_xml: string) => imported),
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
        reloadDiagram: vi.fn(async (_xml: string) => imported),
        exportDiagram: vi.fn(async () => "<designed />"),
        hasPendingInput: vi.fn(() => false),
        flushPendingInput: vi.fn(),
        viewport: { centerOnElement: vi.fn() },
    };
}

function viewerSurface() {
    return {
        reloadDiagram: vi.fn(async (_xml: string) => imported),
        exportDiagram: vi.fn(async () => "<viewed />"),
        viewport: { centerOnElement: vi.fn() },
    };
}

function surfaceDocumentOn(initialSurface: object) {
    const posted: (Command | Query)[] = [];
    let surface = initialSurface;
    const afterImport = vi.fn();
    const surfaceDocument = createSurfaceDocument(
        { postMessage: (message) => posted.push(message) },
        { getSurface: () => surface as unknown as SurfaceHandle, afterImport },
    );
    return {
        surfaceDocument,
        posted,
        afterImport,
        replaceSurface: (next: object) => {
            surface = next;
        },
    };
}

const postedOfType = <TType extends ProtocolMessageType>(
    posted: (Command | Query)[],
    type: TType,
) => posted.filter((message): message is MessageOfType<TType> => isMessageOfType(message, type));

describe("createSurfaceDocument", () => {
    describe("host document import", () => {
        it("reloads the host XML into the surface, which keeps the user's view", async () => {
            const surface = modelerSurface();
            const { surfaceDocument } = surfaceDocumentOn(surface);

            await surfaceDocument.importDocument("<definitions />");

            expect(surface.reloadDiagram).toHaveBeenCalledExactlyOnceWith("<definitions />");
            expect(surface.newDiagram).not.toHaveBeenCalled();
        });

        it.each([
            ["empty", ""],
            ["whitespace-only", "\n"],
            ["missing", undefined],
        ])(
            "starts a blank diagram for %s content on an editable surface",
            async (_case, content) => {
                const surface = designerSurface();
                const { surfaceDocument } = surfaceDocumentOn(surface);

                await surfaceDocument.importDocument(content);

                expect(surface.newDiagram).toHaveBeenCalledOnce();
                expect(surface.reloadDiagram).not.toHaveBeenCalled();
            },
        );

        it("tells the page once the host XML is in, so views of the diagram catch up", async () => {
            const surface = modelerSurface();
            const { surfaceDocument, afterImport } = surfaceDocumentOn(surface);

            await surfaceDocument.importDocument("<definitions />");

            expect(afterImport).toHaveBeenCalledOnce();
            expect(afterImport.mock.invocationCallOrder[0]).toBeGreaterThan(
                surface.reloadDiagram.mock.invocationCallOrder[0]!,
            );
        });

        it("hands missing content to the readonly viewer as empty XML", async () => {
            const surface = viewerSurface();
            const { surfaceDocument } = surfaceDocumentOn(surface);

            await surfaceDocument.importDocument(undefined);

            expect(surface.reloadDiagram).toHaveBeenCalledExactlyOnceWith("");
        });

        it("logs the import warnings to the host", async () => {
            const surface = modelerSurface();
            surface.reloadDiagram.mockResolvedValueOnce({
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

    it("re-imports the exported XML for a diagram refresh", async () => {
        const surface = modelerSurface();
        const { surfaceDocument } = surfaceDocumentOn(surface);

        await surfaceDocument.refreshDiagram();

        expect(surface.reloadDiagram).toHaveBeenCalledExactlyOnceWith("<exported />");
    });

    it("centres the element on the live surface's viewport", () => {
        const surface = modelerSurface();
        const { surfaceDocument } = surfaceDocumentOn(surface);

        surfaceDocument.centerOnElement("Task_1");

        expect(surface.viewport.centerOnElement).toHaveBeenCalledExactlyOnceWith("Task_1");
    });
});
