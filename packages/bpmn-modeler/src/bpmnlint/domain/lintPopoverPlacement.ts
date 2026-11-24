export interface PopoverBox {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface PopoverSize {
    width: number;
    height: number;
}

export interface PopoverPlacement {
    vertical: "above" | "below";
    horizontal: "right" | "left";
}

// Prefer the vendor's above/right placement and flip only when the other side has more room.
export function choosePopoverPlacement(
    anchor: PopoverBox,
    popover: PopoverSize,
    bounds: PopoverBox,
): PopoverPlacement {
    const roomAbove = anchor.top - bounds.top;
    const roomBelow = bounds.bottom - anchor.bottom;
    const roomRight = bounds.right - anchor.left;
    const roomLeft = anchor.right - bounds.left;

    return {
        vertical: popover.height <= roomAbove || roomAbove >= roomBelow ? "above" : "below",
        horizontal: popover.width <= roomRight || roomRight >= roomLeft ? "right" : "left",
    };
}
