import {
    BRAND_CONTRAST_ATTRIBUTE,
    type BrandMode,
    brandModeAttributes,
} from "@miragon/bpmn-modeler-shared";

/**
 * Switches the page to a mode the host posts after a theme change; the host
 * wrote the first one into the shell. Both attributes change in one task, so
 * no frame paints a half-switched mode.
 */
export function applyBrandMode(root: HTMLElement, mode: BrandMode): void {
    root.removeAttribute(BRAND_CONTRAST_ATTRIBUTE);
    Object.entries(brandModeAttributes(mode)).forEach(([name, value]) =>
        root.setAttribute(name, value),
    );
}
