import VendorDmnViewer from "dmn-js/lib/Viewer";
import MoveCanvasModule from "diagram-js/lib/navigation/movecanvas";
import ZoomScrollModule from "diagram-js/lib/navigation/zoomscroll";
import camundaModdleDescriptor from "camunda-dmn-moddle/resources/camunda.json";

import {
    DIFF_CATEGORIES,
    DIFF_MARKERS,
    DIFF_SELECTED_MARKER,
    type DiffCounts,
    DisposableStore,
    observeCanvasSize,
    type ResizableCanvas,
    type TableScroll,
    ThemeController,
    type Viewport,
} from "@miragon/bpmn-modeler-types";
import { i18n, TranslateModule, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";

import type { DmnThemeMode } from "../publicApi";
import {
    attributeValue,
    type DmnDiffFocus,
    type DmnDiffMarks,
    type DmnDiffStatus,
    type DmnTableMarks,
    focusCss,
    tableMarksCss,
    viewStatusOf,
} from "./diffMarks";

export type { DmnDiffMarks } from "./diffMarks";

export interface DmnDiffMarkOptions {
    /** Puts each changed table's counts on its decision in the DRD. */
    readonly countBadges?: boolean;
}

/**
 * A read-only DMN view of one side of a diff: the DRD with pan and zoom, and
 * the decision tables and expressions dmn-js opens from it.
 */
export interface DmnDiffViewerHandle {
    importXML(xml: string): Promise<void>;
    /** Marks this pane's changes; every view it opens shows them. */
    setMarks(marks: DmnDiffMarks, options?: DmnDiffMarkOptions): void;
    /**
     * Opens the DRD (`null`) or the view of a decision or business knowledge
     * model. Resolves `false` when this version has no such element.
     */
    openView(elementId: string | null): Promise<boolean>;
    /** The open view: `null` for the DRD, else its element's id. */
    getActiveElementId(): string | null;
    /**
     * How the open view's element differs, as its view is marked; `undefined`
     * for the DRD, a changed table, an element without changes or before marks.
     */
    getViewStatus(): DmnDiffStatus | undefined;
    /** Calls back when the user opens another view; not for {@link openView}. */
    onViewChanged(listener: (elementId: string | null) => void): () => void;
    /** Outlines and scrolls to a DRD element, rule, column or table, or clears the outline. */
    focus(id: string | undefined): void;
    /** Brings a DRD element, rule, column or table into view without outlining it. */
    reveal(id: string): void;
    getViewport(): Viewport | undefined;
    setViewport(viewport: Viewport): void;
    /** Calls back when the user pans or zooms the DRD. */
    onViewportChanged(listener: (viewport: Viewport) => void): () => void;
    getTableScroll(): TableScroll | undefined;
    setTableScroll(scroll: TableScroll): void;
    /** Calls back when the user scrolls the open decision table. */
    onTableScroll(listener: (scroll: TableScroll) => void): () => void;
    setTheme(theme: DmnThemeMode): void;
    setLocale(locale: string): Promise<void>;
    destroy(): void;
}

interface Element {
    readonly id: string;
    readonly x?: number;
    readonly y?: number;
    readonly width?: number;
    readonly height?: number;
}

interface DrdCanvas extends ResizableCanvas {
    addMarker(id: string, marker: string): void;
    removeMarker(id: string, marker: string): void;
    viewbox(): Viewport & { inner: Viewport; outer: { width: number; height: number } };
    viewbox(box: Viewport): void;
}

interface DrdServices {
    canvas: DrdCanvas;
    elementRegistry: { get(id: string): Element | undefined };
    overlays: {
        add(id: string, type: string, overlay: { position: object; html: HTMLElement }): void;
        remove(filter: { type: string }): void;
    };
    eventBus: { on(event: string, callback: () => void): void };
}

interface ViewElement {
    readonly id: string;
    readonly decisionLogic?: {
        readonly input?: readonly { id: string }[];
        readonly output?: readonly { id: string }[];
    };
}

const BADGE_OVERLAY = "dmn-diff-counts";

const VIEWPORT_DEBOUNCE_MS = 80;

let panes = 0;

class DmnDiffViewer implements DmnDiffViewerHandle {
    private readonly viewer: VendorDmnViewer;
    private readonly store = new DisposableStore();
    private readonly style: HTMLStyleElement;
    private readonly scope: string;
    private readonly viewListeners = new Set<(elementId: string | null) => void>();
    private readonly viewportListeners = new Set<(viewport: Viewport) => void>();
    private readonly scrollListeners = new Set<(scroll: TableScroll) => void>();
    private readonly boundDrdBuses = new WeakSet<object>();
    private marks?: DmnDiffMarks;
    private markOptions: DmnDiffMarkOptions = {};
    private focused?: string;
    private selectedOnCanvas?: string;
    /** The view the partner pane knows: the last one reported or opened for it. */
    private announcedView: string | null = null;
    private openingView = false;
    private movingViewport = false;
    private expectedScroll?: { top: number; left: number };
    private viewportTimer?: ReturnType<typeof setTimeout>;
    /** Where the DRD was, so it comes back there when dmn-js renders it again. */
    private drdViewport?: Viewport;
    private themeController?: ThemeController;

    constructor(
        private readonly container: HTMLElement,
        private readonly topInset = 0,
    ) {
        panes += 1;
        this.scope = `[data-dmn-diff="${panes}"]`;
        container.classList.add("dmn-diff");
        container.dataset.dmnDiff = String(panes);
        this.style = document.createElement("style");
        container.append(this.style);

        this.viewer = new VendorDmnViewer({
            container,
            // dmn-js drops common.additionalModules, so each view needs TranslateModule.
            drd: { additionalModules: [TranslateModule, ZoomScrollModule, MoveCanvasModule] },
            decisionTable: { additionalModules: [TranslateModule] },
            literalExpression: { additionalModules: [TranslateModule] },
            boxedExpression: { additionalModules: [TranslateModule] },
            moddleExtensions: { camunda: camundaModdleDescriptor },
        });

        const rendered = () => {
            this.placeDrd();
            this.applyMarks();
        };
        const viewsChanged = () => this.notifyViewChanged();
        const scrolled = (event: Event) => this.onScroll(event);
        this.viewer.on("import.render.complete", rendered);
        this.viewer.on("views.changed", viewsChanged);
        container.addEventListener("scroll", scrolled, true);
        this.store.add(
            () => this.viewer.off("import.render.complete", rendered),
            () => this.viewer.off("views.changed", viewsChanged),
            () => container.removeEventListener("scroll", scrolled, true),
            () => clearTimeout(this.viewportTimer),
            () => this.viewer.destroy(),
            () => this.style.remove(),
            observeCanvasSize({ resized: () => this.drd()?.canvas.resized() }, container),
        );
    }

    async importXML(xml: string): Promise<void> {
        this.openingView = true;
        try {
            await this.viewer.importXML(xml);
        } finally {
            this.openingView = false;
        }
        this.announcedView = this.getActiveElementId();
    }

    setMarks(marks: DmnDiffMarks, options: DmnDiffMarkOptions = {}): void {
        this.marks = marks;
        this.markOptions = options;
        this.applyMarks();
    }

    async openView(elementId: string | null): Promise<boolean> {
        const view = this.viewer
            .getViews()
            .find((candidate) =>
                elementId === null ? candidate.type === "drd" : candidate.element.id === elementId,
            );
        if (!view) {
            return false;
        }
        // dmn-js reports a view change after the open resolves; it is not news to the partner.
        this.announcedView = elementId;
        if (view !== this.viewer.getActiveView()) {
            this.openingView = true;
            try {
                await this.viewer.open(view);
            } finally {
                this.openingView = false;
            }
        }
        return true;
    }

    getActiveElementId(): string | null {
        const view = this.viewer.getActiveView();
        return !view || view.type === "drd" ? null : view.element.id;
    }

    getViewStatus(): DmnDiffStatus | undefined {
        const element = this.activeElement();
        return element && this.statusOf(element);
    }

    onViewChanged(listener: (elementId: string | null) => void): () => void {
        return subscribe(this.viewListeners, listener);
    }

    focus(id: string | undefined): void {
        this.focused = id;
        this.applyMarks();
        if (id !== undefined) this.reveal(id);
    }

    reveal(id: string): void {
        const drd = this.drd();
        if (drd) {
            this.centerOn(drd, id);
        } else {
            this.scrollTableTo(id);
        }
    }

    getViewport(): Viewport | undefined {
        const box = this.drd()?.canvas.viewbox();
        return box && { x: box.x, y: box.y, width: box.width, height: box.height };
    }

    setViewport(viewport: Viewport): void {
        const canvas = this.drd()?.canvas;
        if (!canvas) return;
        this.movingViewport = true;
        try {
            canvas.viewbox(viewport);
            this.drdViewport = viewport;
        } finally {
            this.movingViewport = false;
        }
    }

    onViewportChanged(listener: (viewport: Viewport) => void): () => void {
        return subscribe(this.viewportListeners, listener);
    }

    getTableScroll(): TableScroll | undefined {
        const scroller = this.scroller();
        if (!scroller) return undefined;
        const sideOnly = new Set(this.sideOnlyRules());
        const anchor = this.ruleNumberCells().find(
            (cell) =>
                !sideOnly.has(cell.dataset.rowId ?? "") &&
                rowTop(scroller, cell) + cell.offsetHeight > scroller.scrollTop,
        );
        return anchor
            ? {
                  rule: anchor.dataset.rowId,
                  offset: scroller.scrollTop - rowTop(scroller, anchor),
                  left: scroller.scrollLeft,
              }
            : { offset: scroller.scrollTop, left: scroller.scrollLeft };
    }

    setTableScroll(scroll: TableScroll): void {
        const scroller = this.scroller();
        if (!scroller) return;
        const anchor = scroll.rule
            ? this.ruleNumberCells().find((cell) => cell.dataset.rowId === scroll.rule)
            : undefined;
        const top = (anchor ? rowTop(scroller, anchor) : 0) + scroll.offset;
        this.expectedScroll = { top: Math.round(top), left: Math.round(scroll.left) };
        scroller.scrollTo({ top, left: scroll.left });
    }

    onTableScroll(listener: (scroll: TableScroll) => void): () => void {
        return subscribe(this.scrollListeners, listener);
    }

    setTheme(theme: DmnThemeMode): void {
        if (!this.themeController) {
            const controller = new ThemeController([this.container], "data-dmn-theme");
            this.themeController = controller;
            this.store.add(() => controller.dispose());
        }
        this.themeController.setMode(theme);
    }

    async setLocale(locale: string): Promise<void> {
        const before = i18n.getLocale();
        i18n.setLanguage(locale as SupportedLocale);
        const view = this.viewer.getActiveView();
        if (i18n.getLocale() === before || !view) return;
        this.openingView = true;
        try {
            await this.viewer.open(view);
        } finally {
            this.openingView = false;
        }
    }

    destroy(): void {
        this.viewListeners.clear();
        this.viewportListeners.clear();
        this.scrollListeners.clear();
        this.store.dispose();
    }

    private drd(): DrdServices | undefined {
        const view = this.viewer.getActiveView();
        if (view?.type !== "drd") return undefined;
        const viewer = this.viewer.getActiveViewer();
        if (!viewer) return undefined;
        return {
            canvas: viewer.get<DrdCanvas>("canvas"),
            elementRegistry: viewer.get<DrdServices["elementRegistry"]>("elementRegistry"),
            overlays: viewer.get<DrdServices["overlays"]>("overlays"),
            eventBus: viewer.get<DrdServices["eventBus"]>("eventBus"),
        };
    }

    private activeElement(): ViewElement | undefined {
        const view = this.viewer.getActiveView();
        return view && view.type !== "drd" ? (view.element as unknown as ViewElement) : undefined;
    }

    private applyMarks(): void {
        const drd = this.drd();
        const element = this.activeElement();
        this.style.textContent = "";
        delete this.container.dataset.dmnDiffView;
        if (drd) {
            this.markDrd(drd);
        } else if (element) {
            this.markView(element);
        }
    }

    private markDrd(drd: DrdServices): void {
        this.bindViewport(drd);
        const marks = this.marks;
        if (!marks) return;
        for (const category of DIFF_CATEGORIES) {
            for (const id of marks[category]) {
                if (drd.elementRegistry.get(id)) drd.canvas.addMarker(id, DIFF_MARKERS[category]);
            }
        }
        if (this.selectedOnCanvas && drd.elementRegistry.get(this.selectedOnCanvas)) {
            drd.canvas.removeMarker(this.selectedOnCanvas, DIFF_SELECTED_MARKER);
        }
        this.selectedOnCanvas = undefined;
        if (this.focused && drd.elementRegistry.get(this.focused)) {
            drd.canvas.addMarker(this.focused, DIFF_SELECTED_MARKER);
            this.selectedOnCanvas = this.focused;
        }
        drd.overlays.remove({ type: BADGE_OVERLAY });
        if (!this.markOptions.countBadges) return;
        for (const [id, table] of Object.entries(marks.tables)) {
            if (drd.elementRegistry.get(id)) {
                drd.overlays.add(id, BADGE_OVERLAY, {
                    position: { top: -11, right: 8 },
                    html: countBadge(table.counts),
                });
            }
        }
    }

    private markView(element: ViewElement): void {
        const status = this.statusOf(element);
        if (status) this.container.dataset.dmnDiffView = status;
        const table = this.marks?.tables[element.id];
        if (!table) return;
        const columns = columnIds(element);
        this.style.textContent =
            tableMarksCss(this.scope, table, columns) +
            focusCss(this.scope, this.tableFocus(table), columns);
    }

    private statusOf(element: ViewElement): DmnDiffStatus | undefined {
        return this.marks && viewStatusOf(this.marks, element.id);
    }

    private tableFocus(table: DmnTableMarks): DmnDiffFocus | undefined {
        const id = this.focused;
        if (id === undefined) return undefined;
        if (id === table.attributesStep) return { kind: "table", id };
        const { columns } = table;
        if ([...columns.added, ...columns.removed, ...columns.changed].includes(id)) {
            return { kind: "column", id };
        }
        return { kind: "rule", id };
    }

    private bindViewport(drd: DrdServices): void {
        if (this.boundDrdBuses.has(drd.eventBus)) return;
        this.boundDrdBuses.add(drd.eventBus);
        drd.eventBus.on("canvas.viewbox.changed", () => {
            if (this.movingViewport || this.openingView) return;
            this.drdViewport = this.getViewport();
            clearTimeout(this.viewportTimer);
            this.viewportTimer = setTimeout(() => {
                const viewport = this.getViewport();
                if (viewport) this.viewportListeners.forEach((listener) => listener(viewport));
            }, VIEWPORT_DEBOUNCE_MS);
        });
    }

    /**
     * dmn-js renders the DRD anew each time it opens. The first time the
     * diagram is fitted below the top inset, never zoomed past 100 %; after
     * that it comes back where it was.
     */
    private placeDrd(): void {
        const drd = this.drd();
        if (!drd) return;
        if (this.drdViewport) {
            this.setViewport(this.drdViewport);
            return;
        }
        const { inner, outer } = drd.canvas.viewbox();
        if (!outer.width || !outer.height || !inner.width || !inner.height) return;
        const margin = 24;
        const scale = Math.min(
            1,
            (outer.width - 2 * margin) / inner.width,
            (outer.height - this.topInset - 2 * margin) / inner.height,
        );
        const width = outer.width / scale;
        this.setViewport({
            x: inner.x + inner.width / 2 - width / 2,
            y: inner.y - (this.topInset + margin) / scale,
            width,
            height: outer.height / scale,
        });
    }

    private centerOn(drd: DrdServices, id: string): void {
        const element = drd.elementRegistry.get(id);
        if (!element || element.x === undefined || element.y === undefined) return;
        const box = drd.canvas.viewbox();
        const centerX = element.x + (element.width ?? 0) / 2;
        const centerY = element.y + (element.height ?? 0) / 2;
        this.setViewport({
            x: centerX - box.width / 2,
            y: centerY - box.height / 2,
            width: box.width,
            height: box.height,
        });
    }

    private scrollTableTo(id: string): void {
        const find = (selector: string) => this.container.querySelector<HTMLElement>(selector);
        const value = attributeValue(id);
        const changedCells = (this.marks?.tables[this.activeElement()?.id ?? ""]?.cells ?? [])
            .map((cell) => find(`td[data-element-id="${attributeValue(cell)}"]`))
            .filter((cell) => cell?.dataset.rowId === id);
        const target =
            changedCells[0] ??
            find(`td.rule-index[data-row-id="${value}"]`) ??
            find(`[data-col-id="${value}"]`) ??
            find(".hit-policy");
        target?.scrollIntoView({ block: "center", inline: "center" });
    }

    private notifyViewChanged(): void {
        const elementId = this.getActiveElementId();
        if (elementId === this.announcedView) return;
        this.announcedView = elementId;
        this.viewListeners.forEach((listener) => listener(elementId));
    }

    private onScroll(event: Event): void {
        const scroller = this.scroller();
        if (!scroller || event.target !== scroller) return;
        const expected = this.expectedScroll;
        if (
            expected &&
            Math.abs(scroller.scrollTop - expected.top) <= 1 &&
            Math.abs(scroller.scrollLeft - expected.left) <= 1
        ) {
            this.expectedScroll = undefined;
            return;
        }
        const scroll = this.getTableScroll();
        if (scroll) this.scrollListeners.forEach((listener) => listener(scroll));
    }

    private scroller(): HTMLElement | null {
        return this.container.querySelector<HTMLElement>(".tjs-table-container");
    }

    private ruleNumberCells(): HTMLElement[] {
        return [...this.container.querySelectorAll<HTMLElement>("td.rule-index[data-row-id]")];
    }

    private sideOnlyRules(): string[] {
        const table = this.marks?.tables[this.activeElement()?.id ?? ""];
        return table ? [...table.rules.added, ...table.rules.removed] : [];
    }
}

export interface DmnDiffViewerOptions {
    readonly theme?: DmnThemeMode;
    /** Pixels at the top of the pane the first DRD fit leaves free, for chrome floating there. */
    readonly topInset?: number;
}

/** Stand up one read-only DMN diff pane in `container`. */
export function createDiffViewer(
    container: HTMLElement,
    options: DmnDiffViewerOptions = {},
): DmnDiffViewerHandle {
    i18n.extend(i18nExtras);
    const viewer = new DmnDiffViewer(container, options.topInset);
    if (options.theme) viewer.setTheme(options.theme);
    return viewer;
}

function columnIds(element: ViewElement): string[] {
    const logic = element.decisionLogic;
    return [...(logic?.input ?? []), ...(logic?.output ?? [])].map((column) => column.id);
}

function rowTop(scroller: HTMLElement, cell: HTMLElement): number {
    return (
        cell.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    );
}

function countBadge(counts: DiffCounts): HTMLElement {
    const badge = document.createElement("div");
    badge.className = "dmn-diff-counts";
    for (const category of DIFF_CATEGORIES) {
        const count = document.createElement("span");
        count.className = `dmn-diff-counts__${category}`;
        count.textContent = String(counts[category]);
        badge.append(count);
    }
    return badge;
}

function subscribe<T>(listeners: Set<T>, listener: T): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
