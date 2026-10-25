import type { RefObject } from "preact";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import { hoverCardPosition, type HoverCardPosition } from "../positioning";

interface HoverCardPlacement {
    /**
     * Whether the card may open right of the anchor when the left side lacks room. Not for a
     * template's card: reaching it there crosses the palette, whose hovered entries replace it.
     */
    mayOpenRight?: boolean;
}

/**
 * Places a hover card beside `anchorRef`, level with the item `findPreviewed`
 * returns from inside `scrollRef`, or yields null when nothing is previewed.
 */
export function useHoverCardPosition(
    anchorRef: RefObject<HTMLElement>,
    scrollRef: RefObject<HTMLElement>,
    findPreviewed: (scrollContainer: HTMLElement) => Element | null | undefined,
    { mayOpenRight = false }: HoverCardPlacement = {},
): HoverCardPosition | null {
    const [position, setPosition] = useState<HoverCardPosition | null>(null);
    const findPreviewedRef = useRef(findPreviewed);
    findPreviewedRef.current = findPreviewed;

    const measure = useCallback(() => {
        const anchor = anchorRef.current;
        const scrollContainer = scrollRef.current;
        const previewed = scrollContainer ? findPreviewedRef.current(scrollContainer) : null;
        const anchorRect = anchor?.getBoundingClientRect();
        const measured =
            anchorRect && previewed
                ? hoverCardPosition(
                      {
                          panelLeft: anchorRect.left,
                          panelRight: mayOpenRight ? anchorRect.right : undefined,
                          cardTop: previewed.getBoundingClientRect().top,
                      },
                      { width: window.innerWidth, height: window.innerHeight },
                  )
                : null;
        setPosition((current) => (isSamePosition(current, measured) ? current : measured));
    }, [anchorRef, scrollRef, mayOpenRight]);

    // Measured after every commit because the overlay moves the whole panel when it clamps
    // it to the canvas, which the columns cannot observe through their own props.
    useLayoutEffect(measure);

    useEffect(() => {
        const scrollContainer = scrollRef.current;
        scrollContainer?.addEventListener("scroll", measure);
        return () => scrollContainer?.removeEventListener("scroll", measure);
    }, [measure, scrollRef]);

    return position;
}

function isSamePosition(a: HoverCardPosition | null, b: HoverCardPosition | null): boolean {
    return a?.top === b?.top && a?.left === b?.left && a?.maxHeight === b?.maxHeight;
}
