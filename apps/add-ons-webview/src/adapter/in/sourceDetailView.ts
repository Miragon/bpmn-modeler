import { Store } from "lucide";

import { sourceActionEmphasis } from "../../domain/actionEmphasis";
import type { SourcePlacement } from "../../domain/catalogQueries";
import { CHROME_TEXT, templateCountText } from "../../domain/chromeTexts";
import { isBusy, ViewState } from "../../domain/viewState";
import { aboutBadgesOf, aboutFor, readmeSection } from "./aboutView";
import { separator } from "./detailParts";
import { actionButton, el, icon, markFocus, setBusy } from "./dom";
import { SOURCE_ACTION_ICON, SOURCE_ICON } from "./icons";
import { statusBox } from "./statusMarks";

/** A source with a detail: what the core says of it, its actions as real buttons, and its README. */
export function sourceDetailOf({ group, source }: SourcePlacement, state: ViewState): HTMLElement {
    const busy = isBusy(state, source.id);
    const detail = el("article", "av-detail-card");
    detail.setAttribute("aria-label", source.label);
    setBusy(detail, busy);
    if (busy) detail.append(el("div", "ds-busy-bar av-detail-busy"));
    const head = el("header", "av-detail-head");
    const top = el("div", "av-detail-top");
    const tag = el("span", "ds-kind-tag ds-kind-marketplace");
    tag.append(icon(Store, 14), el("span", "", CHROME_TEXT.marketplace));
    top.append(tag);
    if (source.stateText !== undefined) top.append(el("span", "av-badge", source.stateText));
    const about = aboutFor(state, source.id);
    top.append(...aboutBadgesOf(about));
    const name = markFocus(el("h2", "av-detail-name", source.label), "name", source.id);
    name.tabIndex = -1;
    const metaLine = el("p", "av-detail-meta");
    metaLine.append(
        el("span", "", source.description),
        separator("·"),
        el("span", "", templateCountText(source.addOns.length)),
    );
    const where = el("p", "av-location");
    where.append(
        icon(SOURCE_ICON[source.kind], 14, "av-location-icon"),
        el("span", "", group.label),
    );
    head.append(top, name, metaLine, where);
    detail.append(head);
    if (source.problem !== undefined) detail.append(statusBox("danger", source.problem));
    if (source.actions.length > 0) {
        const bar = el("div", "av-actions");
        bar.append(
            ...source.actions.map((action) =>
                actionButton(action, {
                    targetId: source.id,
                    busy,
                    emphasis: sourceActionEmphasis(action.kind),
                    icon: SOURCE_ACTION_ICON[action.kind],
                    focus: "action",
                }),
            ),
        );
        detail.append(bar);
    }
    detail.append(...readmeSection(about?.readme));
    return detail;
}
