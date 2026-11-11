import { h, render } from "preact";

import type { DiagramElementLike } from "./candidates";
import { ReviewPanel } from "./components/ReviewPanel";
import type { ElementIdProposal, ElementIdsService } from "./ElementIdsService";
import { fallbackTranslate, type Translate } from "./translate";

interface CanvasLike {
    getContainer(): HTMLElement;
    scrollToElement?(element: DiagramElementLike): void;
    focus?(): void;
}

interface EventBusLike {
    on(events: string | string[], listener: () => void): void;
}

interface InjectorLike {
    get<T>(name: string, strict: false): T | null;
}

interface SelectionLike {
    select(element: DiagramElementLike): void;
}

/**
 * Opens the review as a panel along the bottom of the canvas, which stays
 * visible and usable above it. The panel mounts beside the canvas container,
 * so diagram-js's keyboard bindings never see its keys.
 */
export class ElementIdReview {
    static $inject = ["elementIds", "canvas", "eventBus", "injector"];

    private container: HTMLElement | undefined;
    private revision = 0;
    private readonly translate: Translate;

    constructor(
        private readonly elementIds: ElementIdsService,
        private readonly canvas: CanvasLike,
        eventBus: EventBusLike,
        private readonly injector: InjectorLike,
    ) {
        this.translate = injector.get<Translate>("translate", false) ?? fallbackTranslate;
        eventBus.on("commandStack.changed", () => {
            if (this.container) {
                this.revision++;
                this.render();
            }
        });
        eventBus.on(["import.done", "diagram.clear", "diagram.destroy"], () => this.close());
    }

    isOpen(): boolean {
        return this.container !== undefined;
    }

    open(): void {
        if (!this.container) {
            const container = document.createElement("div");
            container.className = "eid-root";
            this.canvas.getContainer().parentElement!.appendChild(container);
            this.container = container;
        }
        this.render();
    }

    close(): void {
        if (!this.container) {
            return;
        }
        render(null, this.container);
        this.container.remove();
        this.container = undefined;
    }

    private render(): void {
        const container = this.container!;
        // Mounted outside the instance's themed container, so it carries the theme itself.
        const theme = this.canvas
            .getContainer()
            .closest("[data-bpmn-theme]")
            ?.getAttribute("data-bpmn-theme");
        if (theme) {
            container.setAttribute("data-bpmn-theme", theme);
        }
        render(
            h(ReviewPanel, {
                initialStyle: this.elementIds.getSettings().style,
                revision: this.revision,
                propose: this.propose,
                onApply: this.apply,
                onClose: this.dismiss,
                onReveal: this.reveal,
                translate: this.translate,
            }),
            container,
        );
    }

    private readonly propose = (
        style: Parameters<ElementIdsService["propose"]>[0],
        unchecked: ReadonlySet<string>,
    ) => this.elementIds.propose(style, unchecked);

    private readonly apply = (
        style: Parameters<ElementIdsService["rename"]>[0],
        unchecked: ReadonlySet<string>,
    ) => {
        this.elementIds.rename(style, unchecked);
        this.dismiss();
    };

    private readonly dismiss = () => {
        this.close();
        // Deferred so the panel's own button does not take the focus back, and
        // skipped while a label edit owns the caret.
        queueMicrotask(() => {
            const directEditing = this.injector.get<{ isActive?: () => boolean }>(
                "directEditing",
                false,
            );
            if (!directEditing?.isActive?.()) {
                this.canvas.focus?.();
            }
        });
    };

    private readonly reveal = (proposal: ElementIdProposal) => {
        const element = proposal.candidate.shown;
        this.injector.get<SelectionLike>("selection", false)?.select(element);
        this.canvas.scrollToElement?.(element);
    };
}
