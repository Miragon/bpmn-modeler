import type { svgToImage as SvgToImage } from "@bpmn-io/svg-to-image";

/**
 * Stand-in for `@bpmn-io/svg-to-image`, swapped in by the `lazy-svg-to-image`
 * Vite plugin. camunda-bpmn-js imports it statically for copy-as-image, which
 * would put canvg in the initial bundle although it only runs on that action.
 */
export const svgToImage = (async (...args: Parameters<typeof SvgToImage>) => {
    const { svgToImage: convert } = await import("@bpmn-io/svg-to-image");
    return convert(...args);
}) as typeof SvgToImage;
