import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";

// Lets the mouse travel from an item to its hover card without the card flickering.
const HOVER_HIDE_DELAY = 150;

export interface HoverPreview<Target> {
    /** The item under the mouse, kept for a short delay after the mouse leaves it. */
    hovered: Target | null;
    hoverItem: (target: Target, hovered: boolean) => void;
    /** Keeps the card of the hovered item open while the mouse is on it. */
    hoverCard: (hovered: boolean) => void;
    clear: () => void;
}

/**
 * Tracks the one item the mouse previews across the whole menu, so a hovered
 * item in either column replaces any other preview.
 */
export function useHoverPreview<Target>(): HoverPreview<Target> {
    const [hovered, setHovered] = useState<Target | null>(null);
    const hideTimeoutRef = useRef(0);

    const hideAfterDelay = useCallback(() => {
        window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = window.setTimeout(() => setHovered(null), HOVER_HIDE_DELAY);
    }, []);

    const hoverItem = useCallback(
        (target: Target, entering: boolean) => {
            if (entering) {
                window.clearTimeout(hideTimeoutRef.current);
                setHovered(target);
            } else {
                hideAfterDelay();
            }
        },
        [hideAfterDelay],
    );

    const hoverCard = useCallback(
        (entering: boolean) => {
            if (entering) {
                window.clearTimeout(hideTimeoutRef.current);
            } else {
                hideAfterDelay();
            }
        },
        [hideAfterDelay],
    );

    const clear = useCallback(() => {
        window.clearTimeout(hideTimeoutRef.current);
        setHovered(null);
    }, []);

    useEffect(() => () => window.clearTimeout(hideTimeoutRef.current), []);

    return useMemo(
        () => ({ hovered, hoverItem, hoverCard, clear }),
        [hovered, hoverItem, hoverCard, clear],
    );
}
