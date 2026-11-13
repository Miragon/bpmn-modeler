import type {
    ActionViewPayload,
    AddOnActionKindPayload,
    AddOnPayload,
    AddOnReviewPayload,
} from "@miragon/bpmn-modeler-shared";
import { ArrowLeft, Info } from "lucide";

import { addOnActionEmphasis } from "../../domain/actionEmphasis";
import { detailStatusOf } from "../../domain/addOnStatus";
import type { Placement } from "../../domain/catalogQueries";
import { CHROME_TEXT } from "../../domain/chromeTexts";
import { placedActions, reviewOf } from "../../domain/placedActions";
import { isBusy, ViewState } from "../../domain/viewState";
import { actionButton, button, el, hiddenText, icon, markFocus, setBusy } from "./dom";
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
        detail.append(reviewSection(review, allow && addOnButton(allow, addOn, busy)));
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
    const status = detailStatusOf(addOn);
    const stateLine = el("p", `av-state-line av-tone-${status.tone}`);
    stateLine.append(statusMark(status.tone));
    status.words.forEach((word, index) => {
        // A screen reader pauses between the words; the dot is only for the eye.
        if (index > 0) stateLine.append(separator("·"), hiddenText(", "));
        stateLine.append(el("span", "av-state-word", word));
    });
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

/** One detail shows at a time, so one id names its warning. */
const WARNING_ID = "av-review-warning";

/**
 * The review the core wrote, always open: its warning and facts, with Allow at
 * its end, so Allow is never on screen without the review above it. Allow names
 * the warning as its description.
 */
function reviewSection(
    review: AddOnReviewPayload,
    allow: HTMLButtonElement | undefined,
): HTMLElement {
    const section = el("section", "av-review");
    const body = el("div", "av-review-body");
    const facts = el("dl", "av-facts");
    review.facts.forEach(({ label, value }) => {
        const fact = el("div", "av-fact");
        fact.append(el("dt", "av-fact-label", label), el("dd", "av-fact-value", value));
        facts.append(fact);
    });
    const warning = statusBox("warning", review.warning);
    warning.querySelector(".av-box-text")!.id = WARNING_ID;
    body.append(warning, facts);
    if (allow !== undefined) {
        allow.setAttribute("aria-describedby", WARNING_ID);
        const end = el("div", "av-review-end");
        end.append(allow);
        body.append(end);
    }
    section.append(el("h3", "av-review-heading", review.heading), body);
    return section;
}
