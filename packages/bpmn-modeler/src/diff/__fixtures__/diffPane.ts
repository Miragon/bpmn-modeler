import type { PositionedElement } from "../../kernel/domain/elementGeometry";
import { mountCanvas } from "../../__fixtures__/surfaceMount";
import { DiffViewer, type DiffViewerOptions } from "../service/DiffViewer";
import { COLLAPSED_SUBPROCESS_BEFORE_XML } from "./collapsedSubprocessDiff";

interface DiagramElement extends PositionedElement {
    id: string;
}

interface CanvasService {
    findRoot(element: DiagramElement): DiagramElement | undefined;
    getRootElement(): DiagramElement;
    setRootElement(element: DiagramElement): void;
    scroll(delta: { dx: number; dy: number }): void;
    viewbox(): { x: number; y: number; width: number; height: number };
    zoom(scale?: number): number;
}

export interface ElementRegistryService {
    forEach(callback: (element: DiagramElement) => void): void;
    get(id: string): DiagramElement;
    getGraphics(element: DiagramElement | string): SVGElement;
}

export interface SelectionService {
    select(elements: DiagramElement | DiagramElement[] | null): void;
    get(): DiagramElement[];
}

export function getDiService<T>(viewer: DiffViewer, name: string): T {
    return (viewer as unknown as { viewer: { get(name: string): T } }).viewer.get(name);
}

export function getServices(viewer: DiffViewer): {
    canvas: CanvasService;
    registry: ElementRegistryService;
} {
    return {
        canvas: getDiService<CanvasService>(viewer, "canvas"),
        registry: getDiService<ElementRegistryService>(viewer, "elementRegistry"),
    };
}

export const selectedIds = (selection: SelectionService) =>
    selection.get().map((element) => element.id);

const openedPanes: DiffViewer[] = [];

/** A pane with no diagram imported yet. */
export function openPane(
    options: DiffViewerOptions = {},
    { width, height } = { width: 800, height: 600 },
): {
    container: HTMLElement;
    viewer: DiffViewer;
} {
    const container = mountCanvas(width, height);
    const viewer = new DiffViewer(container, options);
    openedPanes.push(viewer);
    return { container, viewer };
}

/** A pane showing the collapsed-subprocess diff's before version. */
export async function openSelectablePane(options: DiffViewerOptions = {}): Promise<{
    container: HTMLElement;
    viewer: DiffViewer;
    selection: SelectionService;
    registry: ElementRegistryService;
}> {
    const { container, viewer } = openPane(options);
    await viewer.importXML(COLLAPSED_SUBPROCESS_BEFORE_XML);
    return {
        container,
        viewer,
        selection: getDiService<SelectionService>(viewer, "selection"),
        registry: getServices(viewer).registry,
    };
}

/** Destroys every pane opened here; called in `afterEach`, it frees a failing test's panes too. */
export function destroyPanes(): void {
    for (const pane of openedPanes.splice(0)) {
        pane.destroy();
    }
}
