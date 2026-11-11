import type { AddOnCatalogPayload } from "@miragon/bpmn-modeler-shared";

import { AddOnsView } from "../adapter/in/addOnsView";
import type { PersistedChoices, ViewEvent } from "../domain/viewState";
import { AddOnsViewSession } from "../service/AddOnsViewSession";
import { FakeLayout } from "./fakeLayout";
import { RecordingHost } from "./recordingHost";

/** The view in a fresh document, wired to a session as the bootstrap wires it. */
export function mountedView(
    model?: AddOnCatalogPayload,
    options: { readonly narrow?: boolean; readonly saved?: PersistedChoices } = {},
) {
    document.body.innerHTML = '<button id="outside">Outside</button><div id="app"></div>';
    const root = document.getElementById("app")!;
    const host = new RecordingHost(options.saved);
    const layout = new FakeLayout();
    layout.narrow = options.narrow ?? false;
    const events: ViewEvent[] = [];
    const view = new AddOnsView(
        root,
        (event) => {
            events.push(event);
            session.dispatch(event);
        },
        layout,
    );
    const session = new AddOnsViewSession(host, (state, focus) => view.render(state, focus));
    view.render(session.state);
    if (model !== undefined) session.dispatch({ kind: "modelArrived", model });
    const all = <E extends Element>(selector: string, within: ParentNode = root) => [
        ...within.querySelectorAll<E>(selector),
    ];
    const button = (name: string, within: ParentNode = root) =>
        all<HTMLButtonElement>("button", within).find(
            (each) => each.textContent === name || each.getAttribute("aria-label") === name,
        )!;
    const row = (name: string) =>
        all<HTMLButtonElement>(".av-row").find(
            (each) => each.querySelector(".av-row-title")?.textContent === name,
        )!;
    const head = (id: string) =>
        root.querySelector<HTMLElement>(`[data-focus="head"][data-focus-id="${CSS.escape(id)}"]`);
    const tab = (name: string) =>
        all<HTMLButtonElement>("[role=tab]").find((each) => each.textContent?.startsWith(name))!;
    const chip = (name: string) =>
        all<HTMLButtonElement>(".av-chip").find((each) => each.textContent?.startsWith(name))!;
    const rowNames = () => all(".av-row .av-row-title").map((each) => each.textContent);
    const detailName = () => root.querySelector(".av-detail-name")?.textContent;
    const search = () => root.querySelector<HTMLInputElement>("input[type=search]")!;
    const press = (key: string, target: Element = document.activeElement ?? root) =>
        target.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
        );
    const type = (query: string) => {
        search().value = query;
        search().dispatchEvent(new Event("input", { bubbles: true }));
    };
    const arrive = (next: AddOnCatalogPayload) =>
        session.dispatch({ kind: "modelArrived", model: next });
    return {
        root,
        host,
        session,
        view,
        layout,
        events,
        all,
        button,
        row,
        head,
        tab,
        chip,
        rowNames,
        detailName,
        search,
        press,
        type,
        arrive,
    };
}
