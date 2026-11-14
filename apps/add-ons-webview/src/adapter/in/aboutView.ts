import type { AddOnAboutPayload, AddOnReadmePayload } from "@miragon/bpmn-modeler-shared";
import { BookOpen, Scale, Star } from "lucide";

import { CHROME_TEXT } from "../../domain/chromeTexts";
import type { ViewState } from "../../domain/viewState";
import { noteOf } from "./detailParts";
import { el, hiddenText, icon } from "./dom";
import { markdownOf } from "./markdownView";

export function aboutFor(state: ViewState, targetId: string): AddOnAboutPayload | undefined {
    return state.about?.targetId === targetId ? state.about.about : undefined;
}

/**
 * Stars, then the license, at the end of the detail's top row: short on the
 * badge, the core's whole sentence for a screen reader and the tooltip.
 */
export function aboutBadgesOf(about: AddOnAboutPayload | undefined): HTMLElement[] {
    const badges = el("span", "av-about-badges");
    if (about?.stars !== undefined) {
        badges.append(aboutBadge("av-stars", Star, about.stars.text, about.stars.label));
    }
    if (about?.license !== undefined) {
        const { kind, text, label } = about.license;
        badges.append(aboutBadge(`av-license av-license-${kind}`, Scale, text, label));
    }
    return badges.childElementCount === 0 ? [] : [badges];
}

function aboutBadge(
    className: string,
    glyph: typeof Star,
    text: string,
    label: string,
): HTMLElement {
    const badge = el("span", `av-about-badge ${className}`);
    badge.title = label;
    badge.append(icon(glyph, 14, "av-about-icon"), el("span", "", text), hiddenText(`, ${label}`));
    return badge;
}

/** Nothing until the host answered, and nothing for none, so a detail never flashes an empty section. */
export function readmeSection(readme: AddOnReadmePayload | undefined): HTMLElement[] {
    if (readme === undefined || readme.kind === "none") return [];
    const section = el("section", "av-readme");
    const heading = el("h3", "av-readme-heading");
    heading.append(icon(BookOpen, 14, "av-readme-icon"), el("span", "", CHROME_TEXT.readme));
    section.append(heading);
    if (readme.kind === "unreadable") {
        section.append(el("p", "av-readme-problem", readme.text));
        return [section];
    }
    section.append(markdownOf(readme.markdown));
    if (readme.truncated) section.append(noteOf(CHROME_TEXT.readmeTruncated));
    return [section];
}
