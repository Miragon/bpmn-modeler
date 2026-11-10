import { Check, CircleAlert, TriangleAlert } from "lucide";

import type { RowStatus, StatusTone } from "../../domain/addOnStatus";
import type { AddOnKind } from "../../domain/catalogFilter";
import { KIND_TEXT } from "../../domain/chromeTexts";
import { el, icon } from "./dom";
import { KIND_ICON } from "./icons";

/** A dot, ring or icon by tone, so the shape tells the state apart without its colour. */
export function statusMark(tone: StatusTone): Element {
    switch (tone) {
        case "danger":
            return icon(CircleAlert, 14, "av-mark");
        case "success":
            return icon(Check, 14, "av-mark");
        case "warning":
            return el("span", "av-mark av-dot");
        case "neutral":
            return el("span", "av-mark av-ring");
    }
}

export function statusBadge(status: RowStatus, className: string): HTMLElement {
    const badge = el("span", `av-status av-tone-${status.tone} ${className}`);
    badge.append(statusMark(status.tone), el("span", "av-status-word", status.word));
    return badge;
}

/** A status box after brand §8: a tinted surface, a 4px edge and an icon in the status role. */
export function statusBox(tone: "danger" | "warning", text: string, className = ""): HTMLElement {
    const box = el("div", `av-box av-box-${tone} ${className}`.trim());
    box.append(
        icon(tone === "danger" ? CircleAlert : TriangleAlert, 16, "av-box-icon"),
        el("p", "av-box-text", text),
    );
    return box;
}

/** A problem line under a header: it stays in sight while its header is closed. */
export function problemLine(text: string, className: string): HTMLElement {
    const line = el("p", `av-problem ${className}`);
    line.append(icon(CircleAlert, 14, "av-problem-icon"), el("span", "", text));
    return line;
}

/** The kind as a coloured square with its icon; the word goes beside it or to a screen reader. */
export function kindTile(kind: AddOnKind, small = false): HTMLElement {
    const tile = el("span", `av-tile${small ? " av-tile-small" : ""} ds-kind-${kind}`);
    tile.append(icon(KIND_ICON[kind], small ? 12 : 14));
    return tile;
}

/** The kind as a small coloured tag: icon and word, so colour is never the only signal. */
export function kindTag(kind: AddOnKind): HTMLElement {
    const tag = el("span", `ds-kind-tag ds-kind-${kind}`);
    tag.append(icon(KIND_ICON[kind], 14), el("span", "", KIND_TEXT[kind].singular));
    return tag;
}
