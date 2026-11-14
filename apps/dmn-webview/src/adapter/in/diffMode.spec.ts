import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    ApplyDmnDiffHighlightsQuery,
    DmnFileQuery,
    type DmnDiffView,
    LanguageQuery,
    SyncCursorQuery,
    SyncDmnDiffScrollQuery,
    SyncDmnDiffViewQuery,
    SyncViewportQuery,
} from "@miragon/bpmn-modeler-shared";
import type { TableScroll, Viewport } from "@miragon/bpmn-modeler-types";
import type { DmnDiffStatus, DmnDiffViewerHandle } from "@miragon/dmn-modeler";

import type { DmnDiffPaneHost } from "../../port/dmnHost";
import { DiffMode } from "./diffMode";

const TABLE = {
    columns: { added: [], removed: [], changed: [] },
    rules: { added: ["Rule_10"], removed: [], changed: ["Rule_3"], moved: [] },
    cells: ["Out_Cost_3"],
    annotations: [],
    properties: [],
    counts: { added: 1, removed: 1, changed: 1, layoutChanged: 0 },
    navigationOrder: ["Rule_3", "Rule_6", "Rule_10"],
};

/** The after pane's side of a change: Rule_6 and Decision_Surcharge exist only before. */
const VIEW: DmnDiffView = {
    added: ["Input_Insured"],
    removed: [],
    changed: ["Decision_Shipping"],
    layoutChanged: [],
    counts: { added: 1, removed: 1, changed: 1, layoutChanged: 0 },
    navigationOrder: ["Decision_Shipping", "Decision_Surcharge", "Input_Insured"],
    tables: { Decision_Shipping: TABLE },
    expressions: [],
};

class FakeViewer implements DmnDiffViewerHandle {
    readonly calls: Array<[string, ...unknown[]]> = [];
    readonly views: Array<(elementId: string | null) => void> = [];
    readonly viewports: Array<(viewport: Viewport) => void> = [];
    readonly scrolls: Array<(scroll: TableScroll) => void> = [];
    activeElement: string | null = null;
    viewStatus: DmnDiffStatus | undefined;
    hasElement = true;
    importFails = false;

    async importXML(xml: string): Promise<void> {
        this.calls.push(["importXML", xml]);
        if (this.importFails) throw new Error("not a DMN file");
    }
    setMarks(...args: unknown[]): void {
        this.calls.push(["setMarks", ...args]);
    }
    async openView(elementId: string | null): Promise<boolean> {
        this.calls.push(["openView", elementId]);
        if (this.hasElement) this.activeElement = elementId;
        return this.hasElement;
    }
    getActiveElementId(): string | null {
        return this.activeElement;
    }
    getViewStatus(): DmnDiffStatus | undefined {
        return this.viewStatus;
    }
    onViewChanged(listener: (elementId: string | null) => void): () => void {
        this.views.push(listener);
        return () => undefined;
    }
    focus(id: string | undefined): void {
        this.calls.push(["focus", id]);
    }
    reveal(id: string): void {
        this.calls.push(["reveal", id]);
    }
    getViewport(): Viewport | undefined {
        return undefined;
    }
    setViewport(viewport: Viewport): void {
        this.calls.push(["setViewport", viewport]);
    }
    onViewportChanged(listener: (viewport: Viewport) => void): () => void {
        this.viewports.push(listener);
        return () => undefined;
    }
    getTableScroll(): TableScroll | undefined {
        return undefined;
    }
    setTableScroll(scroll: TableScroll): void {
        this.calls.push(["setTableScroll", scroll]);
    }
    onTableScroll(listener: (scroll: TableScroll) => void): () => void {
        this.scrolls.push(listener);
        return () => undefined;
    }
    setTheme(): void {
        this.calls.push(["setTheme"]);
    }
    async setLocale(locale: string): Promise<void> {
        this.calls.push(["setLocale", locale]);
    }
    destroy(): void {
        this.calls.push(["destroy"]);
    }
    called(name: string): unknown[][] {
        return this.calls.filter(([call]) => call === name).map(([, ...args]) => args);
    }
}

let viewer: FakeViewer;
let posted: Array<{ type: string } & Record<string, unknown>>;
let chrome: HTMLElement;
let stop: () => void;

function startPane(): DiffMode {
    const host = {
        postMessage: (message: unknown) => posted.push(message as never),
        getState: () => undefined,
        setState: () => undefined,
        updateState: () => undefined,
    } as DmnDiffPaneHost;
    const mode = new DiffMode(viewer, chrome, host);
    stop = mode.start();
    return mode;
}

async function readyPane(
    side: "before" | "after" = "after",
    origin: "scm" | "compare-files" = "scm",
) {
    const mode = startPane();
    await mode.handle(new DmnFileQuery("<definitions />"));
    await mode.handle(new ApplyDmnDiffHighlightsQuery(side, VIEW, origin, "shipping.dmn"));
    return mode;
}

const postedTypes = () => posted.map((message) => message.type);
const legendText = () => chrome.querySelector(".diff-legend")?.textContent ?? "";
const click = (selector: string) => chrome.querySelector<HTMLButtonElement>(selector)?.click();

beforeEach(() => {
    viewer = new FakeViewer();
    posted = [];
    chrome = document.createElement("div");
    document.body.append(chrome);
});

afterEach(() => {
    stop?.();
    chrome.remove();
    document.body.className = "";
    delete document.body.dataset.diffSide;
});

describe("DiffMode", () => {
    it("asks for its file, imports it and reports ready", async () => {
        const mode = startPane();

        await mode.handle(new DmnFileQuery("<definitions />"));
        await mode.handle(new DmnFileQuery("<definitions again />"));

        expect(postedTypes()).toEqual(["GetDmnFileCommand", "DiffReadyCommand"]);
        expect(viewer.called("importXML")).toEqual([["<definitions />"]]);
    });

    it("answers a message from the host window", async () => {
        startPane();

        window.dispatchEvent(new MessageEvent("message", { data: new DmnFileQuery("<x />") }));
        await vi.waitFor(() => expect(postedTypes()).toContain("DiffReadyCommand"));
    });

    it("logs a file it cannot import and does not report ready", async () => {
        viewer.importFails = true;
        const mode = startPane();

        await mode.handle(new DmnFileQuery("broken"));

        expect(postedTypes()).toEqual(["GetDmnFileCommand", "LogErrorCommand"]);
        expect(posted[1].message).toBe("DMN diff import failed: not a DMN file");
    });

    it("holds highlights that arrive before the import and paints them after it", async () => {
        const mode = startPane();

        await mode.handle(new ApplyDmnDiffHighlightsQuery("after", VIEW, "scm", "shipping.dmn"));
        expect(viewer.called("setMarks")).toEqual([]);
        await mode.handle(new DmnFileQuery("<definitions />"));

        expect(viewer.called("setMarks")).toEqual([[VIEW, { countBadges: true }]]);
        expect(document.body.dataset.diffSide).toBe("after");
    });

    it("puts the table counts on the DRD only on the after side", async () => {
        await readyPane("before");

        expect(viewer.called("setMarks")).toEqual([[VIEW, { countBadges: false }]]);
    });

    it("shows the DRD's counts in the legend", async () => {
        await readyPane();

        expect(legendText()).toContain("Added 1");
        expect(legendText()).toContain("Removed 1");
        expect(chrome.querySelector(".diff-side-label")?.textContent).toBe("New version");
        expect(chrome.querySelector<HTMLElement>(".diff-legend__swap-group")?.hidden).toBe(true);
    });

    it("names the file and swaps the sides on a compare-files pane", async () => {
        await readyPane("after", "compare-files");

        click(".diff-legend__swap-btn");

        expect(chrome.querySelector(".diff-side-label")?.textContent).toBe("shipping.dmn");
        expect(postedTypes()).toContain("SwapCompareSidesCommand");
    });

    it("tells the host about the view, pan, zoom and scroll the user changes", async () => {
        await readyPane();

        viewer.views.forEach((listener) => listener("Decision_Shipping"));
        viewer.viewports.forEach((listener) => listener({ x: 1, y: 2, width: 3, height: 4 }));
        viewer.scrolls.forEach((listener) => listener({ rule: "Rule_3", offset: 0, left: 0 }));

        expect(postedTypes().slice(-3)).toEqual([
            "DmnDiffViewChangedCommand",
            "ViewportChangedCommand",
            "DmnDiffScrollChangedCommand",
        ]);
        expect(legendText()).toContain("Changed 1");
    });

    it("follows the partner's view, pan, zoom and scroll without posting them back", async () => {
        const mode = await readyPane();
        const before = posted.length;
        const viewport = { x: 1, y: 2, width: 3, height: 4 };
        const scroll = { rule: "Rule_3", offset: 4, left: 0 };

        await mode.handle(new SyncDmnDiffViewQuery("Decision_Shipping"));
        await mode.handle(new SyncViewportQuery(viewport));
        await mode.handle(new SyncDmnDiffScrollQuery(scroll));

        expect(posted.length).toBe(before);
        expect(viewer.called("openView")).toEqual([["Decision_Shipping"]]);
        expect(viewer.called("setViewport")).toEqual([[viewport]]);
        expect(viewer.called("setTableScroll")).toEqual([[scroll]]);
    });

    it("shows a card for a decision its version lacks and goes back to the DRD for both panes", async () => {
        const mode = await readyPane();
        viewer.hasElement = false;

        await mode.handle(new SyncDmnDiffViewQuery("Decision_Surcharge"));

        const card = chrome.querySelector<HTMLElement>(".dmn-diff-empty");
        expect(card?.hidden).toBe(false);
        expect(card?.textContent).toContain("It was removed.");
        const status = chrome.querySelector<HTMLElement>(".diff-legend__slot--status");
        expect(status?.hidden).toBe(false);
        expect(status?.textContent).toBe("Removed");
        expect(chrome.querySelector<HTMLButtonElement>(".diff-legend__next-btn")?.disabled).toBe(
            true,
        );

        viewer.hasElement = true;
        card?.querySelector<HTMLButtonElement>("button")?.click();
        await vi.waitFor(() => expect(card?.hidden).toBe(true));
        expect(viewer.called("openView").at(-1)).toEqual([null]);
        expect(posted.at(-1)).toMatchObject({ type: "DmnDiffViewChangedCommand", elementId: null });
    });

    it("names the open view's change as the viewer marks it", async () => {
        await readyPane();
        viewer.viewStatus = "added";

        viewer.views.forEach((listener) => listener("Decision_New"));

        expect(
            chrome.querySelector(".diff-legend__slot--status .diff-legend__swatch--added"),
        ).not.toBeNull();
        expect(chrome.querySelector<HTMLElement>(".diff-legend__slot--status")?.hidden).toBe(false);
        expect(chrome.querySelector<HTMLElement>(".diff-legend__slot--added")?.hidden).toBe(true);
        expect(legendText()).not.toContain("Added 1");
    });

    it("opens the view the partner opened before the import once the file is in", async () => {
        const mode = startPane();

        await mode.handle(new SyncDmnDiffViewQuery("Decision_Shipping"));
        const openedBeforeImport = viewer.called("openView");
        await mode.handle(new DmnFileQuery("<definitions />"));
        await mode.handle(new ApplyDmnDiffHighlightsQuery("before", VIEW, "scm", "shipping.dmn"));

        expect(openedBeforeImport).toEqual([]);
        expect(viewer.called("openView")).toEqual([["Decision_Shipping"]]);
        expect(chrome.querySelector<HTMLElement>(".dmn-diff-empty")?.hidden).toBe(true);
        expect(legendText()).toContain("Added 1");
        expect(postedTypes()).not.toContain("DmnDiffViewChangedCommand");
        expect(postedTypes().at(-1)).toBe("DiffReadyCommand");
    });

    it("shows the card for a view the partner opened before the import that this version lacks", async () => {
        const mode = startPane();
        viewer.hasElement = false;

        await mode.handle(new SyncDmnDiffViewQuery("Decision_Surcharge"));
        await mode.handle(new DmnFileQuery("<definitions />"));
        await mode.handle(new ApplyDmnDiffHighlightsQuery("after", VIEW, "scm", "shipping.dmn"));

        expect(chrome.querySelector(".dmn-diff-empty")?.textContent).toContain("It was removed.");
    });

    it("names a decision the before version lacks as new", async () => {
        const mode = await readyPane("before");
        viewer.hasElement = false;

        await mode.handle(new SyncDmnDiffViewQuery("Input_Insured"));

        expect(chrome.querySelector(".dmn-diff-empty")?.textContent).toContain("It is new.");
    });

    it("steps through the open table's changes and tells the partner pane", async () => {
        const mode = await readyPane();
        await mode.handle(new SyncDmnDiffViewQuery("Decision_Shipping"));

        click(".diff-legend__next-btn");

        expect(viewer.called("focus").at(-1)).toEqual(["Rule_3"]);
        expect(posted.at(-1)).toMatchObject({ type: "CursorChangedCommand", index: 0 });
    });

    it("brings a neighbour into view for a change only the partner's version has", async () => {
        const mode = await readyPane();
        await mode.handle(new SyncDmnDiffViewQuery("Decision_Shipping"));

        click(".diff-legend__next-btn");
        click(".diff-legend__next-btn");

        expect(viewer.called("focus").at(-1)).toEqual([undefined]);
        expect(viewer.called("reveal").at(-1)).toEqual(["Rule_10"]);
    });

    it("steps back from the start to the last change", async () => {
        await readyPane();

        click(".diff-legend__prev-btn");

        expect(viewer.called("focus").at(-1)).toEqual(["Input_Insured"]);
        expect(posted.at(-1)).toMatchObject({ type: "CursorChangedCommand", index: 2 });
    });

    it("applies the partner's cursor without posting it back and ignores one out of range", async () => {
        const mode = await readyPane();
        const before = posted.length;

        await mode.handle(new SyncCursorQuery(0));
        await mode.handle(new SyncCursorQuery(9));

        expect(viewer.called("focus").at(-1)).toEqual(["Decision_Shipping"]);
        expect(posted.length).toBe(before);
    });

    it("does not step before the highlights arrive or in a view without changes", async () => {
        const mode = startPane();
        await mode.handle(new SyncCursorQuery(0));
        await mode.handle(new DmnFileQuery("<definitions />"));
        await mode.handle(new ApplyDmnDiffHighlightsQuery("after", VIEW, "scm", "shipping.dmn"));
        await mode.handle(new SyncDmnDiffViewQuery("Decision_Other"));

        click(".diff-legend__next-btn");

        expect(viewer.called("focus")).toEqual([[undefined]]);
        expect(postedTypes()).not.toContain("CursorChangedCommand");
    });

    it("follows a language change", async () => {
        const mode = await readyPane();

        await mode.handle(new LanguageQuery("de"));

        expect(viewer.called("setLocale")).toEqual([["de"]]);
    });
});
