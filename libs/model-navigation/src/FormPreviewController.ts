import type { BusinessObjectLike } from "./extractReference";
import { extractReference } from "./extractReference";
import { is } from "bpmn-js/lib/util/ModelUtil";
import type { FormPreviewHandle, ModelNavigationPort, PreviewRect } from "./ModelNavigationPort";
import type { FormReferenceStatusClient } from "./FormReferenceStatusClient";
import {
    reduceFormPreview,
    type FormPreviewEvent,
    type FormPreviewState,
} from "./formPreviewState";

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
    static $inject = [
        "eventBus",
        "selection",
        "canvas",
        "contextPad",
        "modelNavigationPort",
        "formReferenceStatusClient",
    ];
    private state: FormPreviewState<PreviewElement> = {
        dismissed: false,
        attempted: false,
        explicit: false,
    };
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
        private readonly status: Pick<FormReferenceStatusClient, "isResolved">,
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
        return this.state.target === element && this.visible;
    }

    openManual(element: PreviewElement): void {
        if (this.disposed) return;
        this.transition({
            kind: "manual",
            target: element,
            available: !!this.state.reference && this.status.isResolved(this.state.reference),
        });
    }

    private update(): void {
        if (this.disposed || !this.port.formPreview) return;
        const elements = this.selection.get();
        const target =
            elements.length === 1 && is(elements[0], "bpmn:UserTask") ? elements[0] : undefined;
        const reference = target && extractReference(target.businessObject, "form");
        this.transition({
            kind: "selection",
            target,
            reference,
            available:
                this.port.isReferenceAvailabilityKnown?.() === false
                    ? undefined
                    : !!reference && this.status.isResolved(reference),
            visible: this.visible,
        });
    }

    private transition(event: FormPreviewEvent<PreviewElement>): void {
        const decision = reduceFormPreview(this.state, event);
        if (decision.action !== "keep") this.stop();
        this.state = decision.state;
        if (decision.action === "open") this.start(decision.automatic);
        if (decision.action === "indicate") this.start(true, true);
    }

    private start(automatic: boolean, unavailable = false): void {
        const target = this.state.target;
        const id = this.state.reference;
        if (!target || !id || !this.port.formPreview) return;
        const version = ++this.version;
        this.handle = this.port.formPreview.open({
            id,
            automatic,
            unavailable,
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
                this.transition({ kind: "dismiss" });
                this.refreshPad();
            },
            onExplicitRequest: () => {
                if (version === this.version) this.transition({ kind: "refresh" });
            },
            focusCanvas: () => this.canvas.focus(),
        });
    }

    private refreshPad(): void {
        if (this.state.target && this.contextPad.isOpen())
            this.contextPad.open(this.state.target, true);
    }

    private stop(): void {
        this.version++;
        this.handle?.close();
        this.handle = undefined;
        this.visible = false;
    }
}
