import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
    ApplyDiffHighlightsQuery,
    type CursorChangedCommand,
    type DiffReadyCommand,
    type LogErrorCommand,
    type SwapCompareSidesCommand,
    type SyncDocumentCommand,
    SyncCursorQuery,
    SyncViewportQuery,
    type ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";
import type { DiffOrigin } from "@miragon/bpmn-modeler-types";

// The real diff primitives need a live bpmn-js canvas, which jsdom cannot load.
const fakes = vi.hoisted(() => {
    type Viewport = { x: number; y: number; width: number; height: number };

    class FakeDiffViewer {
        static last: FakeDiffViewer;
        importXML = vi.fn(async (_xml: string) => ({ warnings: [] }));
        clearHighlights = vi.fn();
        applyHighlights = vi.fn();
        setViewport = vi.fn();
        viewportListener: ((viewport: Viewport) => void) | undefined;
        onViewportChanged = vi.fn((listener: (viewport: Viewport) => void) => {
            this.viewportListener = listener;
        });
        constructor() {
            FakeDiffViewer.last = this;
        }
    }

    class FakeDiffNavigator {
        static last: FakeDiffNavigator;
        canStep = true;
        setChanges = vi.fn();
        cycleLength = 3;
        applyCursor = vi.fn();
        reset = vi.fn();
        advance = vi.fn((_direction: 1 | -1): number | undefined => undefined);
        constructor() {
            FakeDiffNavigator.last = this;
        }
    }

    class FakeDiffLegend {
        static last: FakeDiffLegend;
        update = vi.fn();
        reserveRoomOn = vi.fn();
        constructor(
            readonly parent: HTMLElement,
            readonly callbacks: {
                onPrevious(): void;
                onNext(): void;
                onSwap?(): void;
                onShowAll?(): void;
            },
        ) {
            FakeDiffLegend.last = this;
        }
    }

    class FakeDiffSideLabel {
        static last: FakeDiffSideLabel | undefined;
        showFilename = vi.fn();
        constructor(
            readonly parent: HTMLElement,
            readonly side: "before" | "after",
        ) {
            FakeDiffSideLabel.last = this;
        }
    }

    return { FakeDiffViewer, FakeDiffNavigator, FakeDiffLegend, FakeDiffSideLabel };
});

vi.mock("@miragon/bpmn-modeler/viewer", () => ({
    DiffViewer: fakes.FakeDiffViewer,
    DiffNavigator: fakes.FakeDiffNavigator,
    DiffLegend: fakes.FakeDiffLegend,
    DiffSideLabel: fakes.FakeDiffSideLabel,
}));

import { DiffMode } from "./diffMode";

const viewer = () => fakes.FakeDiffViewer.last;
const navigator = () => fakes.FakeDiffNavigator.last;
const legend = () => fakes.FakeDiffLegend.last;
const sideLabel = () => fakes.FakeDiffSideLabel.last;

type PostedByDiffMode = Parameters<ConstructorParameters<typeof DiffMode>[2]["postMessage"]>[0];

function dispatch(data: unknown): void {
    window.dispatchEvent(new MessageEvent("message", { data }));
}

function highlights(origin: DiffOrigin, side: "before" | "after" = "after") {
    return new ApplyDiffHighlightsQuery(
        side,
        ["Added_1"],
        ["Removed_1"],
        ["Changed_1"],
        ["Moved_1"],
        { added: 1, removed: 1, changed: 1, layoutChanged: 1 },
        ["Changed_1", "Added_1", "Removed_1"],
        origin,
        "after.bpmn",
    );
}

describe("DiffMode", () => {
    let windowAddEventListener: ReturnType<typeof vi.spyOn>;
    const host = {
        postMessage: vi.fn(),
        getState: vi.fn(),
        setState: vi.fn(),
        updateState: vi.fn(),
    };
    const posted = () => host.postMessage.mock.calls.map(([message]) => message);

    async function startDiffPane(xml = "<before />"): Promise<DiffMode> {
        const diffMode = new DiffMode(
            document.createElement("div"),
            document.createElement("div"),
            host,
        );
        await diffMode.startWith(xml);
        return diffMode;
    }

    beforeEach(() => {
        windowAddEventListener = vi.spyOn(window, "addEventListener");
    });

    afterEach(() => {
        for (const [type, listener, options] of windowAddEventListener.mock.calls) {
            window.removeEventListener(type, listener as EventListener, options);
        }
        vi.restoreAllMocks();
        host.postMessage.mockReset();
        fakes.FakeDiffSideLabel.last = undefined;
        delete document.body.dataset.diffSide;
    });

    describe("initial import", () => {
        it("reports the pane ready once the initial XML is imported", async () => {
            await startDiffPane("<initial />");

            expect(viewer().importXML).toHaveBeenCalledWith("<initial />");
            expect(posted()).toEqual([expect.objectContaining({ type: "DiffReadyCommand" })]);
            expect(viewer().importXML.mock.invocationCallOrder[0]).toBeLessThan(
                host.postMessage.mock.invocationCallOrder[0],
            );
        });

        it.each([
            [new Error("bad"), "DiffViewer import failed: bad", expect.any(String)],
            ["boom", "DiffViewer import failed: boom", expect.any(String)],
        ])(
            "logs a failed import of %j instead of reporting ready",
            async (reason, message, stack) => {
                vi.spyOn(console, "error").mockImplementation(() => undefined);
                const diffMode = new DiffMode(
                    document.createElement("div"),
                    document.createElement("div"),
                    host,
                );
                viewer().importXML.mockRejectedValueOnce(reason);

                await diffMode.startWith("<broken />");

                expect(posted()).toEqual([
                    expect.objectContaining({ type: "LogErrorCommand", message, stack }),
                ]);
            },
        );
    });

    describe("highlights from the host", () => {
        it("repaints every change category and tags the pane's side", async () => {
            await startDiffPane();

            dispatch(highlights("compare-files"));

            expect(document.body.dataset.diffSide).toBe("after");
            expect(viewer().applyHighlights.mock.calls).toEqual([
                [["Added_1"], "diff-added"],
                [["Removed_1"], "diff-removed"],
                [["Changed_1"], "diff-changed"],
                [["Moved_1"], "diff-layout-changed"],
            ]);
            expect(viewer().clearHighlights.mock.invocationCallOrder[0]).toBeLessThan(
                viewer().applyHighlights.mock.invocationCallOrder[0],
            );
            expect(navigator().setChanges).toHaveBeenCalledWith([
                "Changed_1",
                "Added_1",
                "Removed_1",
            ]);
        });

        it("lets the legend step only when the navigator has a change to step to", async () => {
            await startDiffPane();
            navigator().canStep = false;

            dispatch(highlights("scm"));

            expect(legend().update).toHaveBeenCalledWith(
                expect.objectContaining({
                    counts: { added: 1, removed: 1, changed: 1, layoutChanged: 1 },
                    canStep: false,
                }),
            );
        });

        it("offers the swap button only when comparing files", async () => {
            await startDiffPane();
            const counts = { added: 1, removed: 1, changed: 1, layoutChanged: 1 };

            dispatch(highlights("compare-files"));
            dispatch(highlights("scm"));

            expect(legend().update.mock.calls).toEqual([
                [{ counts, showSwap: true, canStep: true, showChanges: true }],
                [{ counts, showSwap: false, canStep: true, showChanges: true }],
            ]);
        });

        it("labels the pane with its side, or with the file when comparing files", async () => {
            const canvas = document.createElement("div");
            const diffMode = new DiffMode(canvas, document.createElement("div"), host);
            await diffMode.startWith("<before />");

            dispatch(highlights("compare-files", "before"));
            dispatch(highlights("scm", "before"));

            expect(sideLabel()?.parent).toBe(canvas);
            expect(sideLabel()?.side).toBe("before");
            expect(sideLabel()?.showFilename.mock.calls).toEqual([["after.bpmn"], [undefined]]);
        });

        it("leaves the changes to the after pane's bar, so both bars read as one", async () => {
            await startDiffPane();

            dispatch(highlights("compare-files", "before"));

            expect(legend().update).toHaveBeenCalledWith(
                expect.objectContaining({ showChanges: false, showSwap: false }),
            );
        });
    });

    describe("highlights during the initial import", () => {
        function startGatedDiffPane() {
            const diffMode = new DiffMode(
                document.createElement("div"),
                document.createElement("div"),
                host,
            );
            let finishImport!: () => void;
            let failImport!: (reason: Error) => void;
            viewer().importXML.mockReturnValueOnce(
                new Promise((resolve, reject) => {
                    finishImport = () => resolve({ warnings: [] });
                    failImport = reject;
                }),
            );
            const started = diffMode.startWith("<before />");
            return { started, finishImport: () => finishImport(), failImport };
        }

        it("paints highlights that arrive during the initial import once it finishes", async () => {
            const { started, finishImport } = startGatedDiffPane();

            dispatch(highlights("compare-files"));
            dispatch(highlights("scm"));
            expect(viewer().applyHighlights).not.toHaveBeenCalled();
            expect(legend().update).not.toHaveBeenCalled();

            finishImport();
            await started;

            expect(viewer().clearHighlights).toHaveBeenCalledOnce();
            expect(legend().update).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({ showSwap: false }),
            );
            expect(posted()).toEqual([expect.objectContaining({ type: "DiffReadyCommand" })]);
            expect(legend().update.mock.invocationCallOrder[0]).toBeLessThan(
                host.postMessage.mock.invocationCallOrder[0],
            );
        });

        it("drops highlights held for an import that failed", async () => {
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            const { started, failImport } = startGatedDiffPane();

            dispatch(highlights("compare-files"));
            failImport(new Error("bad"));
            await started;

            expect(viewer().applyHighlights).not.toHaveBeenCalled();
            expect(legend().update).not.toHaveBeenCalled();
        });
    });

    describe("partner pane sync", () => {
        it("follows the partner's viewport without echoing it", async () => {
            await startDiffPane();
            host.postMessage.mockClear();
            const viewport = { x: 10, y: 20, width: 300, height: 200 };

            dispatch(new SyncViewportQuery(viewport));

            expect(viewer().setViewport).toHaveBeenCalledWith(viewport);
            expect(host.postMessage).not.toHaveBeenCalled();
        });

        it("follows the partner's cursor without echoing it", async () => {
            await startDiffPane();
            host.postMessage.mockClear();

            dispatch(new SyncCursorQuery(2));

            expect(navigator().applyCursor).toHaveBeenCalledWith(2);
            expect(host.postMessage).not.toHaveBeenCalled();
        });

        it("goes back to the whole diagram when the partner does, without echoing it", async () => {
            await startDiffPane();
            host.postMessage.mockClear();

            dispatch(new SyncCursorQuery(-1));

            expect(navigator().reset).toHaveBeenCalledOnce();
            expect(navigator().applyCursor).not.toHaveBeenCalled();
            expect(host.postMessage).not.toHaveBeenCalled();
        });

        it("shows the position of the change the partner stepped to", async () => {
            await startDiffPane();
            dispatch(highlights("scm"));

            dispatch(new SyncCursorQuery(2));

            expect(legend().update).toHaveBeenLastCalledWith(
                expect.objectContaining({ position: { index: 2, total: 3 } }),
            );
        });

        it("reports a user pan or zoom to the host", async () => {
            await startDiffPane();
            const viewport = { x: 1, y: 2, width: 3, height: 4 };

            viewer().viewportListener?.(viewport);

            expect(posted()).toContainEqual(
                expect.objectContaining({ type: "ViewportChangedCommand", viewport }),
            );
        });
    });

    describe("legend controls", () => {
        it("steps forward and backward and reports the new cursor", async () => {
            await startDiffPane();
            host.postMessage.mockClear();
            navigator().advance.mockReturnValueOnce(3).mockReturnValueOnce(2);

            legend().callbacks.onNext();
            legend().callbacks.onPrevious();

            expect(navigator().advance.mock.calls).toEqual([[1], [-1]]);
            expect(posted()).toEqual([
                expect.objectContaining({ type: "CursorChangedCommand", index: 3 }),
                expect.objectContaining({ type: "CursorChangedCommand", index: 2 }),
            ]);
        });

        it("shows the position of the change it stepped to", async () => {
            await startDiffPane();
            dispatch(highlights("scm"));
            navigator().advance.mockReturnValueOnce(0);

            legend().callbacks.onNext();

            expect(legend().update).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    counts: expect.any(Object),
                    position: { index: 0, total: 3 },
                }),
            );
        });

        it("reports nothing when there is no change to step to", async () => {
            await startDiffPane();
            host.postMessage.mockClear();

            legend().callbacks.onNext();

            expect(host.postMessage).not.toHaveBeenCalled();
        });

        it("goes back to the whole diagram with Show all, and takes the partner along", async () => {
            await startDiffPane();
            dispatch(highlights("scm"));
            host.postMessage.mockClear();

            legend().callbacks.onShowAll?.();

            expect(navigator().reset).toHaveBeenCalledOnce();
            expect(legend().update).toHaveBeenLastCalledWith(
                expect.not.objectContaining({ position: expect.anything() }),
            );
            expect(posted()).toEqual([
                expect.objectContaining({ type: "CursorChangedCommand", index: -1 }),
            ]);
        });

        it("asks the host to swap the compared files", async () => {
            await startDiffPane();
            host.postMessage.mockClear();

            legend().callbacks.onSwap?.();

            expect(posted()).toEqual([
                expect.objectContaining({ type: "SwapCompareSidesCommand" }),
            ]);
        });
    });
});

// Type-level spec: the `typecheck` script fails when an expectation breaks.
describe("DiffMode's host channel", () => {
    it("posts the diff pane's commands", () => {
        expectTypeOf<DiffReadyCommand>().toExtend<PostedByDiffMode>();
        expectTypeOf<ViewportChangedCommand>().toExtend<PostedByDiffMode>();
        expectTypeOf<CursorChangedCommand>().toExtend<PostedByDiffMode>();
        expectTypeOf<SwapCompareSidesCommand>().toExtend<PostedByDiffMode>();
        expectTypeOf<LogErrorCommand>().toExtend<PostedByDiffMode>();
    });

    it("rejects a command of the BPMN editor", () => {
        expectTypeOf<SyncDocumentCommand>().not.toExtend<PostedByDiffMode>();
    });

    it("rejects a query, which only the host sends", () => {
        expectTypeOf<SyncViewportQuery>().not.toExtend<PostedByDiffMode>();
    });
});
