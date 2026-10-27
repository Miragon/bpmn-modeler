import type { BusinessObjectLike } from "./extractReference";
import { extractReference } from "./extractReference";
import { is } from "bpmn-js/lib/util/ModelUtil";
import type { FormPreviewHandle, ModelNavigationPort, PreviewRect } from "./ModelNavigationPort";

interface PreviewElement {
    businessObject?: BusinessObjectLike;
}
interface EventBus {
    on(event: string, callback: (event?: unknown) => void): void;
}
interface Selection {
    get(): PreviewElement[];
}
interface Canvas {
    getContainer(): {
        getBoundingClientRect(): PreviewRect;
        querySelector(selector: string): { getBoundingClientRect(): PreviewRect } | null;
    };
    getAbsoluteBBox(element: PreviewElement): PreviewRect;
    focus(): void;
}
interface ContextPad {
    isOpen(): boolean;
    open(target: unknown, force?: boolean): void;
}

export class FormPreviewController {
    static $inject = ["eventBus", "selection", "canvas", "contextPad", "modelNavigationPort"];
    private target?: PreviewElement;
    private reference?: string;
    private dismissed = false;
    private attempted = false;
    private visible = false;
    private handle?: FormPreviewHandle;
    private version = 0;
    private disposed = false;

    constructor(
        eventBus: EventBus,
        private readonly selection: Selection,
        private readonly canvas: Canvas,
        private readonly contextPad: ContextPad,
        private readonly port: ModelNavigationPort,
    ) {
        eventBus.on("selection.changed", () => this.update());
        for (const name of ["elements.changed", "element.changed"]) {
            eventBus.on(name, () => {
                this.update();
                this.handle?.reposition();
            });
        }
        for (const name of ["canvas.viewbox.changed", "canvas.resized", "contextPad.open"]) {
            eventBus.on(name, () => this.handle?.reposition());
        }
        const unsubscribe = port.onReferenceAvailabilityChanged?.(() => this.update());
        const observer =
            typeof ResizeObserver !== "undefined"
                ? new ResizeObserver(() => this.handle?.reposition())
                : undefined;
        observer?.observe(canvas.getContainer() as HTMLElement);
        eventBus.on("diagram.destroy", () => {
            this.disposed = true;
            this.stop();
            unsubscribe?.();
            observer?.disconnect();
        });
    }

    isVisible(element: PreviewElement): boolean {
        return this.target === element && this.visible;
    }

    openManual(element: PreviewElement): void {
        if (
            !this.disposed &&
            element === this.target &&
            this.reference &&
            this.available(this.reference)
        ) {
            this.stop();
            this.dismissed = false;
            this.start(false);
        }
    }

    private available(id: string): boolean {
        return this.port.isReferenceAvailable?.({ id, kind: "form" }) ?? true;
    }

    private update(): void {
        if (this.disposed || !this.port.formPreview) return;
        const elements = this.selection.get();
        const target =
            elements.length === 1 && is(elements[0], "bpmn:UserTask") ? elements[0] : undefined;
        const reference = target && extractReference(target.businessObject, "form");
        if (target !== this.target || reference !== this.reference) {
            this.stop();
            this.target = target;
            this.reference = reference;
            this.dismissed = false;
            this.attempted = false;
        }
        if (!reference || !this.available(reference)) {
            this.stop();
            this.attempted = false;
            return;
        }
        if (!this.dismissed && !this.attempted) this.start(true);
    }

    private start(automatic: boolean): void {
        const target = this.target;
        const id = this.reference;
        if (!target || !id || !this.port.formPreview) return;
        this.attempted = true;
        const version = ++this.version;
        this.handle = this.port.formPreview.open({
            id,
            automatic,
            anchor: () => {
                const container = this.canvas.getContainer();
                const canvas = container.getBoundingClientRect();
                const box = this.canvas.getAbsoluteBBox(target);
                const pad = container
                    .querySelector(".djs-context-pad.open")
                    ?.getBoundingClientRect();
                return {
                    canvas,
                    task: { ...box, x: canvas.x + box.x, y: canvas.y + box.y },
                    contextPad: pad && pad.width > 0 ? pad : undefined,
                };
            },
            onVisibilityChanged: (visible) => {
                if (version !== this.version) return;
                this.visible = visible;
                this.refreshPad();
            },
            onClose: () => {
                if (version !== this.version) return;
                this.dismissed = true;
                this.stop();
                this.refreshPad();
            },
            focusCanvas: () => this.canvas.focus(),
        });
    }

    private refreshPad(): void {
        if (this.target && this.contextPad.isOpen()) this.contextPad.open(this.target, true);
    }

    private stop(): void {
        this.version++;
        this.handle?.close();
        this.handle = undefined;
        this.visible = false;
    }
}
