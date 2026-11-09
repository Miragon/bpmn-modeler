import type { AddOnCatalogPayload } from "@miragon/bpmn-modeler-shared";

import { CatalogView } from "../adapter/in/catalogView";
import { bindOutlineKeyboard } from "../adapter/in/outlineKeyboard";
import type { ViewEvent } from "../domain/viewState";
import { AddOnsViewSession } from "../service/AddOnsViewSession";
import { RecordingHost } from "./recordingHost";

/** The view in a fresh document, wired to a session as the bootstrap wires it. */
export function mountedView(model?: AddOnCatalogPayload) {
    document.body.innerHTML = '<button id="outside">Outside</button><div id="app"></div>';
    const root = document.getElementById("app")!;
    const host = new RecordingHost();
    const events: ViewEvent[] = [];
    const view = new CatalogView(root, (event) => {
        events.push(event);
        session.dispatch(event);
    });
    const session = new AddOnsViewSession(host, (state, focus) => view.render(state, focus));
    bindOutlineKeyboard(root, session, view);
    view.render(session.state);
    if (model !== undefined) session.dispatch({ kind: "modelArrived", model });
    const head = (name: string) =>
        [...root.querySelectorAll<HTMLElement>("[data-head]")].find(
            (each) =>
                each.querySelector(".name")?.textContent === name || each.textContent === name,
        )!;
    const button = (name: string, within: ParentNode = root) =>
        [...within.querySelectorAll<HTMLButtonElement>("button")].find(
            (each) => each.textContent === name,
        )!;
    const press = (key: string, target: Element = document.activeElement ?? root) =>
        target.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
        );
    return { root, host, session, view, events, head, button, press };
}
