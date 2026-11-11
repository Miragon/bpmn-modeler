import type {
    ActionViewPayload,
    AddOnActionKindPayload,
    AddOnPayload,
    AddOnReviewPayload,
} from "@miragon/bpmn-modeler-shared";
import { ArrowLeft, ChevronRight, Info } from "lucide";

import { addOnActionEmphasis } from "../../domain/actionEmphasis";
import { stateToneOf } from "../../domain/addOnStatus";
import type { Placement } from "../../domain/catalogQueries";
import { CHROME_TEXT } from "../../domain/chromeTexts";
import { isReviewOpen, reviewKeyOf } from "../../domain/expansion";
import { placedActions, reviewOf } from "../../domain/placedActions";
import { isBusy, ViewState } from "../../domain/viewState";
import { actionButton, button, el, icon, markFocus, setBusy, toggleButton } from "./dom";
import { ADD_ON_ACTION_ICON, SOURCE_ICON } from "./icons";
import { kindTag, statusBox, statusMark } from "./statusMarks";

export function backButton(onBack: () => void): HTMLButtonElement {
    const back = markFocus(button("ds-btn ds-btn-ghost av-back"), "back");
    back.append(icon(ArrowLeft, 16), el("span", "ds-btn-label", CHROME_TEXT.back));
    back.addEventListener("click", onBack);
    return back;
}

export function hintOf(): HTMLElement {
    const hint = el("div", "av-hint");
    hint.append(el("p", "av-hint-text", CHROME_TEXT.hint));
    return hint;
}

/** Everything the core says about one add-on, with its actions as real buttons. */
export function detailOf(placement: Placement, state: ViewState, revealed: boolean): HTMLElement {
    const { addOn } = placement;
    const busy = isBusy(state, addOn.id);
    const detail = el("article", "av-detail-card");
    detail.setAttribute("aria-label", addOn.name);
    setBusy(detail, busy);
    if (busy) detail.append(el("div", "ds-busy-bar av-detail-busy"));
    detail.append(headOf(placement, revealed));
    if (addOn.problem !== undefined) detail.append(statusBox("danger", addOn.problem));
    if (addOn.note !== undefined) detail.append(noteOf(addOn.note));
    const { rowLine, allow } = placedActions(addOn);
    if (rowLine.length > 0) {
        const bar = el("div", "av-actions");
        bar.append(...rowLine.map((action) => addOnButton(action, addOn, busy)));
        detail.append(bar);
    }
    const review = reviewOf(addOn);
    if (review !== undefined) {
        const open = isReviewOpen(addOn.id, state.expansion);
        detail.append(
            reviewSection(addOn.id, review, open, allow && addOnButton(allow, addOn, busy)),
        );
    }
    return detail;
}

function addOnButton(
    action: ActionViewPayload<AddOnActionKindPayload>,
    addOn: AddOnPayload,
    busy: boolean,
): HTMLButtonElement {
    return actionButton(action, {
        targetId: addOn.id,
        busy,
        emphasis: addOnActionEmphasis(action.kind),
        icon: ADD_ON_ACTION_ICON[action.kind],
        focus: "action",
    });
}

function headOf({ group, source, addOn }: Placement, revealed: boolean): HTMLElement {
    const head = el("header", `av-detail-head${revealed ? " av-revealed" : ""}`);
    // Takes focus after Back's opposite, a reveal or an action, never by Tab.
    const name = markFocus(el("h2", "av-detail-name", addOn.name), "name", addOn.id);
    name.tabIndex = -1;
    const metaLine = el("p", "av-detail-meta");
    [addOn.kindText, addOn.detail, "engineText" in addOn ? addOn.engineText : undefined]
        .filter((part): part is string => part !== undefined && part !== "")
        .forEach((part, index) => {
            if (index > 0) metaLine.append(separator("·"));
            metaLine.append(el("span", "", part));
        });
    const tone = stateToneOf(addOn);
    const stateLine = el("p", `av-state-line av-tone-${tone}`);
    stateLine.append(statusMark(tone), el("span", "", addOn.stateText));
    const top = el("div", "av-detail-top");
    top.append(kindTag(addOn.kind), stateLine);
    const where = el("p", "av-location");
    where.append(
        icon(SOURCE_ICON[source.kind], 14, "av-location-icon"),
        el("span", "", group.label),
        separator("›"),
        el("span", "", source.label),
    );
    head.append(top, name, metaLine, where);
    return head;
}

function separator(glyph: string): HTMLElement {
    const sep = el("span", "av-sep", glyph);
    sep.setAttribute("aria-hidden", "true");
    return sep;
}

function noteOf(note: string): HTMLElement {
    const line = el("p", "av-note");
    line.append(icon(Info, 16, "av-note-icon"), el("span", "", note));
    return line;
}

/** The review the core wrote: its warning, its facts and Allow at its end. */
function reviewSection(
    addOnId: string,
    review: AddOnReviewPayload,
    open: boolean,
    allow: HTMLButtonElement | undefined,
): HTMLElement {
    const section = el("section", "av-review");
    section.dataset.open = String(open);
    const toggle = markFocus(
        toggleButton(reviewKeyOf(addOnId), open, "av-review-toggle"),
        "review",
        addOnId,
    );
    toggle.append(
        icon(ChevronRight, 16, "av-chevron"),
        el("span", "av-review-heading", review.heading),
    );
    section.append(toggle);
    if (!open) return section;
    const body = el("div", "av-review-body");
    const facts = el("dl", "av-facts");
    review.facts.forEach(({ label, value }) => {
        const fact = el("div", "av-fact");
        fact.append(el("dt", "av-fact-label", label), el("dd", "av-fact-value", value));
        facts.append(fact);
    });
    body.append(statusBox("warning", review.warning), facts);
    if (allow !== undefined) {
        const end = el("div", "av-review-end");
        end.append(allow);
        body.append(end);
    }
    section.append(body);
    return section;
}
