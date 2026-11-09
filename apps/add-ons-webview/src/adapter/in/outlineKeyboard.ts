import { visibleHeadsOf } from "../../domain/outline";
import {
    isOutlineKey,
    outlineMoveOf,
    TypeAhead,
    typeAheadTarget,
    typedAhead,
} from "../../domain/outlineMove";
import type { AddOnsViewSession } from "../../service/AddOnsViewSession";
import type { CatalogView } from "./catalogView";

const TOOLBAR_STEP: Readonly<Record<string, (index: number, count: number) => number>> = {
    ArrowRight: (index, count) => (index + 1) % count,
    ArrowLeft: (index, count) => (index - 1 + count) % count,
    Home: () => 0,
    End: (_index, count) => count - 1,
};

/** The outline's keys over its heads, Escape back to a row, and the toolbar's arrow keys. */
export function bindOutlineKeyboard(
    root: HTMLElement,
    session: AddOnsViewSession,
    view: CatalogView,
): void {
    let typed: TypeAhead | undefined;
    root.addEventListener("keydown", (event) => {
        const target = event.target as HTMLElement;
        if (target.closest("[role=toolbar]") !== null) {
            toolbarKey(event, target);
            return;
        }
        if (event.key === "Escape" && target.classList.contains("banner-dismiss")) {
            event.preventDefault();
            session.dispatch({ kind: "bannerDismissed" });
            return;
        }
        const { head, controlsOf } = target.dataset;
        if (head === undefined) {
            if (event.key === "Escape" && controlsOf !== undefined) {
                event.preventDefault();
                view.focusHead(controlsOf);
            }
            return;
        }
        const { model, expansion } = session.state;
        if (model === undefined) return;
        const visible = visibleHeadsOf(model, expansion);
        if (isOutlineKey(event.key)) {
            const move = outlineMoveOf(event.key, head, visible, expansion);
            if (move.kind === "none" || move.kind === "press") return;
            event.preventDefault();
            if (move.kind === "focus") view.focusHead(move.headId);
            if (move.kind === "toggle") session.dispatch({ kind: "toggled", key: move.headId });
            if (move.kind === "controls") view.focusFirstControl(move.headId);
            return;
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            typed = typedAhead(typed, event.key, event.timeStamp);
            const found = typeAheadTarget(typed, head, visible);
            if (found !== undefined) {
                event.preventDefault();
                view.focusHead(found);
            }
        }
    });
}

function toolbarKey(event: KeyboardEvent, target: HTMLElement): void {
    const step = TOOLBAR_STEP[event.key];
    const buttons = [...(target.closest("[role=toolbar]")?.querySelectorAll("button") ?? [])];
    const index = buttons.indexOf(target as HTMLButtonElement);
    if (step === undefined || index === -1) return;
    event.preventDefault();
    buttons[step(index, buttons.length)]?.focus();
}
