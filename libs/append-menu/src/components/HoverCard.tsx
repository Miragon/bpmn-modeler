/**
 * The fixed-position, scrollable frame both preview cards share: the template
 * detail card and the BPMN element description card.
 */
import type { ComponentChildren } from "preact";

import type { HoverCardPosition } from "../positioning";

interface HoverCardProps {
    position: HoverCardPosition;
    id?: string;
    role?: "tooltip";
    onHoverChange: (hovered: boolean) => void;
    children: ComponentChildren;
}

export function HoverCard({ position, id, role, onHoverChange, children }: HoverCardProps) {
    return (
        <div
            id={id}
            role={role}
            class="am-hover-card"
            style={{
                position: "fixed",
                top: `${position.top}px`,
                left: `${position.left}px`,
                maxHeight: `${position.maxHeight}px`,
            }}
            onMouseEnter={() => onHoverChange(true)}
            onMouseLeave={() => onHoverChange(false)}
        >
            <div class="am-hover-card-scroll">{children}</div>
        </div>
    );
}
