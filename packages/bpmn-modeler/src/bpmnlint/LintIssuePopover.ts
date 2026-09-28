import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Overlays from "diagram-js/lib/features/overlays/Overlays";
import type { Overlay } from "diagram-js/lib/features/overlays/Overlays";

import { choosePopoverPlacement } from "./lintPopoverPlacement";

type Translate = (template: string) => string;

const LINTING_OVERLAY_TYPE = "linting";
const OVERLAY_SELECTOR = ".bjsl-overlay";
const ICON_SELECTOR = ".bjsl-icon";
const DROPDOWN_SELECTOR = ".bjsl-dropdown";
const DROPDOWN_CONTENT_SELECTOR = ".bjsl-dropdown-content";
const PINNED_CLASS = "open";

// A relint recreates the overlays of changed elements, so listeners are
// delegated to the canvas container and the pin is tracked by element id.
export class LintIssuePopover {
    static $inject = ["eventBus", "canvas", "overlays", "translate"];

    private pinnedElementId?: string;

    constructor(
        eventBus: EventBus,
        private readonly canvas: Canvas,
        private readonly overlays: Overlays,
        private readonly translate: Translate,
    ) {
        const container = canvas.getContainer();
        container.addEventListener("mouseover", this.handleMouseOver);
        container.addEventListener("click", this.handleClick);
        container.addEventListener("keydown", this.handleKeydown);
        document.addEventListener("pointerdown", this.handleDocumentPointerDown, true);

        eventBus.on("linting.completed", () => this.restoreAfterRelint());
        eventBus.on<{ active: boolean }>("linting.toggle", ({ active }) => {
            if (!active) {
                this.pinnedElementId = undefined;
            }
        });
        eventBus.on("diagram.clear", () => {
            this.pinnedElementId = undefined;
        });
        eventBus.on("diagram.destroy", () => {
            document.removeEventListener("pointerdown", this.handleDocumentPointerDown, true);
        });
    }

    private readonly handleMouseOver = (event: MouseEvent): void => {
        const overlayNode = closestLintOverlay(event.target);
        if (!overlayNode || overlayNode.contains(event.relatedTarget as Node | null)) {
            return;
        }
        this.placeDropdown(overlayNode);
    };

    private readonly handleClick = (event: MouseEvent): void => {
        if (!isLintIcon(event.target)) {
            return;
        }
        const overlayNode = closestLintOverlay(event.target);
        if (overlayNode) {
            this.togglePin(overlayNode);
        }
    };

    private readonly handleKeydown = (event: KeyboardEvent): void => {
        const overlayNode = closestLintOverlay(event.target);
        if (!overlayNode) {
            return;
        }
        if ((event.key === "Enter" || event.key === " ") && isLintIcon(event.target)) {
            event.preventDefault();
            this.togglePin(overlayNode);
            return;
        }
        if (event.key === "Escape" && this.pinnedElementId !== undefined) {
            // Keep the canvas Escape handler from also stealing focus.
            event.preventDefault();
            event.stopPropagation();
            this.unpin();
        }
    };

    private readonly handleDocumentPointerDown = (event: PointerEvent): void => {
        const pinnedNode = this.pinnedOverlayNode();
        if (pinnedNode && !pinnedNode.contains(event.target as Node | null)) {
            this.unpin();
        }
    };

    private togglePin(overlayNode: HTMLElement): void {
        const elementId = this.findOverlay(overlayNode)?.elementId;
        if (elementId === undefined) {
            return;
        }
        const wasPinned = this.pinnedElementId === elementId;
        this.unpin();
        if (!wasPinned) {
            this.pinnedElementId = elementId;
            this.setOpen(overlayNode, true);
        }
    }

    private unpin(): void {
        const pinnedNode = this.pinnedOverlayNode();
        if (pinnedNode) {
            this.setOpen(pinnedNode, false);
        }
        this.pinnedElementId = undefined;
    }

    private restoreAfterRelint(): void {
        for (const { node } of this.lintOverlays()) {
            this.makeKeyboardAccessible(node);
        }
        const pinnedNode = this.pinnedOverlayNode();
        if (pinnedNode) {
            this.setOpen(pinnedNode, true);
        } else {
            this.pinnedElementId = undefined;
        }
    }

    private makeKeyboardAccessible(overlayNode: HTMLElement): void {
        const icon = overlayNode.querySelector<HTMLElement>(ICON_SELECTOR);
        if (icon) {
            icon.tabIndex = 0;
            icon.setAttribute("role", "button");
            icon.setAttribute("aria-expanded", "false");
            icon.setAttribute("aria-label", this.translate("Show lint issues"));
        }
        // Clicks into the issue list must keep focus inside the overlay so Escape reaches us.
        overlayNode.querySelector<HTMLElement>(DROPDOWN_SELECTOR)?.setAttribute("tabindex", "-1");
    }

    private setOpen(overlayNode: HTMLElement, open: boolean): void {
        overlayNode.querySelector(DROPDOWN_SELECTOR)?.classList.toggle(PINNED_CLASS, open);
        overlayNode.querySelector(ICON_SELECTOR)?.setAttribute("aria-expanded", String(open));
        if (open) {
            this.placeDropdown(overlayNode);
        }
    }

    private placeDropdown(overlayNode: HTMLElement): void {
        // Root overlays already open below by vendor design.
        if (this.findOverlay(overlayNode)?.isRoot !== false) {
            return;
        }
        const icon = overlayNode.querySelector(ICON_SELECTOR);
        const dropdown = overlayNode.querySelector(DROPDOWN_SELECTOR);
        const content = overlayNode.querySelector(DROPDOWN_CONTENT_SELECTOR);
        if (!icon || !dropdown || !content) {
            return;
        }

        // Force the dropdown visible for a synchronous measurement; nothing paints in between.
        const wasOpen = dropdown.classList.contains(PINNED_CLASS);
        dropdown.classList.add(PINNED_CLASS);
        const popoverBox = content.getBoundingClientRect();
        dropdown.classList.toggle(PINNED_CLASS, wasOpen);

        const placement = choosePopoverPlacement(
            icon.getBoundingClientRect(),
            popoverBox,
            this.canvas.getContainer().getBoundingClientRect(),
        );
        overlayNode.classList.toggle("bjsl-issues-top-right", placement.vertical === "above");
        overlayNode.classList.toggle("bjsl-issues-bottom-right", placement.vertical === "below");
        overlayNode.classList.toggle("lint-popover-left", placement.horizontal === "left");
    }

    private pinnedOverlayNode(): HTMLElement | undefined {
        if (this.pinnedElementId === undefined) {
            return undefined;
        }
        return this.lintOverlays().find(({ elementId }) => elementId === this.pinnedElementId)
            ?.node;
    }

    private findOverlay(overlayNode: HTMLElement): LintOverlay | undefined {
        return this.lintOverlays().find(({ node }) => node === overlayNode);
    }

    private lintOverlays(): LintOverlay[] {
        const overlays = this.overlays.get({ type: LINTING_OVERLAY_TYPE }) as Overlay[];
        return overlays.flatMap(({ html, element }) => {
            if (!(html instanceof HTMLElement) || typeof element === "string") {
                return [];
            }
            return [{ node: html, elementId: element.id, isRoot: !element.parent }];
        });
    }
}

interface LintOverlay {
    node: HTMLElement;
    elementId: string;
    isRoot: boolean;
}

function closestLintOverlay(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element ? target.closest<HTMLElement>(OVERLAY_SELECTOR) : null;
}

function isLintIcon(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest(ICON_SELECTOR) !== null;
}
