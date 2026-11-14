import { Info } from "lucide";

import { el, icon } from "./dom";

export function separator(glyph: string): HTMLElement {
    const sep = el("span", "av-sep", glyph);
    sep.setAttribute("aria-hidden", "true");
    return sep;
}

export function noteOf(note: string): HTMLElement {
    const line = el("p", "av-note");
    line.append(icon(Info, 16, "av-note-icon"), el("span", "", note));
    return line;
}
