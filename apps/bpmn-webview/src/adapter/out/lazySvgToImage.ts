import type { svgToImage as SvgToImage } from "@bpmn-io/svg-to-image";

/**
 * Stand-in for `@bpmn-io/svg-to-image`, swapped in by the `lazy-svg-to-image`
 * Vite plugin. bpmn-js-copy-as-image imports it statically, which would put
 * canvg in the initial bundle although it only runs on the copy-as-image action.
 */
export const svgToImage = (async (...args: Parameters<typeof SvgToImage>) => {
    const { svgToImage: convert } = await import("@bpmn-io/svg-to-image");
    return convert(...args);
}) as typeof SvgToImage;
