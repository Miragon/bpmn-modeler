/**
 * Floating card that shows a BPMN element's description, so the icon-only
 * palette and keyboard users both get what the element is for.
 */
import type { HoverCardPosition } from "../positioning";
import type { PopupMenuEntry } from "../types";
import { HoverCard } from "./HoverCard";

interface ElementDescriptionCardProps {
    /** Referenced by the previewed button's `aria-describedby`. */
    id: string;
    entry: PopupMenuEntry;
    position: HoverCardPosition;
    onHoverChange: (hovered: boolean) => void;
}

export function ElementDescriptionCard({
    id,
    entry,
    position,
    onHoverChange,
}: ElementDescriptionCardProps) {
    return (
        <HoverCard id={id} role="tooltip" position={position} onHoverChange={onHoverChange}>
            <h4 class="am-hover-card-name">{entry.label}</h4>
            <p class="am-hover-card-desc">{entry.description}</p>
        </HoverCard>
    );
}
