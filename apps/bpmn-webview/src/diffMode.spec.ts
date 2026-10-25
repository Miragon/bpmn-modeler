import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    ApplyDiffHighlightsQuery,
    SyncCursorQuery,
    SyncViewportQuery,
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
        setChanges = vi.fn();
        applyCursor = vi.fn();
        advance = vi.fn((_direction: 1 | -1): number | undefined => undefined);
        constructor() {
            FakeDiffNavigator.last = this;
        }
    }

    class FakeDiffLegend {
        static last: FakeDiffLegend;
        update = vi.fn();
        constructor(
            readonly parent: HTMLElement,
            readonly callbacks: { onPrevious(): void; onNext(): void; onSwap?(): void },
        ) {
            FakeDiffLegend.last = this;
        }
    }

    return { FakeDiffViewer, FakeDiffNavigator, FakeDiffLegend };
});

vi.mock("@miragon/bpmn-modeler/viewer", () => ({
    DiffViewer: fakes.FakeDiffViewer,
    DiffNavigator: fakes.FakeDiffNavigator,
    DiffLegend: fakes.FakeDiffLegend,
}));

import { DiffMode } from "./diffMode";

const viewer = () => fakes.FakeDiffViewer.last;
const navigator = () => fakes.FakeDiffNavigator.last;
const legend = () => fakes.FakeDiffLegend.last;

function dispatch(data: unknown): void {
    window.dispatchEvent(new MessageEvent("message", { data }));
}

function highlights(origin: DiffOrigin) {
    return new ApplyDiffHighlightsQuery(
        "after",
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
            expect(navigator().setChanges).toHaveBeenCalledWith(
                {
                    added: ["Added_1"],
                    removed: ["Removed_1"],
                    changed: ["Changed_1"],
                    layoutChanged: ["Moved_1"],
                },
                ["Changed_1", "Added_1", "Removed_1"],
            );
        });

        it("shows the file name and swap button only when comparing files", async () => {
            await startDiffPane();
            const counts = { added: 1, removed: 1, changed: 1, layoutChanged: 1 };

            dispatch(highlights("compare-files"));
            dispatch(highlights("scm"));

            expect(legend().update.mock.calls).toEqual([
                [{ counts, filename: "after.bpmn", showSwap: true }],
                [{ counts, filename: undefined, showSwap: false }],
            ]);
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

        it("reports nothing when there is no change to step to", async () => {
            await startDiffPane();
            host.postMessage.mockClear();

            legend().callbacks.onNext();

            expect(host.postMessage).not.toHaveBeenCalled();
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
